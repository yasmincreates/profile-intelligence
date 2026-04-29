import { Request, Response } from "express";
import {
  exchangeGitHubCode,
  getGitHubUser,
  upsertUser,
  issueTokens,
  rotateRefreshToken,
  invalidateRefreshToken,
} from "./auth.service";

// In-memory state store: state → { redirect_uri, expires }
const pendingStates = new Map<string, { redirect_uri: string; expires: number }>();

function cleanStates() {
  const now = Date.now();
  for (const [key, val] of pendingStates.entries()) {
    if (val.expires < now) pendingStates.delete(key);
  }
}

export async function initiateOAuth(req: Request, res: Response) {
  cleanStates();

  const redirect_uri = (req.query.redirect_uri as string) ?? "";
  const state = require("crypto").randomBytes(16).toString("hex");

  pendingStates.set(state, {
    redirect_uri,
    expires: Date.now() + 10 * 60 * 1000,
  });

  const callbackUrl = `${req.protocol}://${req.get("host")}/auth/github/callback`;

  const githubUrl = new URL("https://github.com/login/oauth/authorize");
  githubUrl.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID!);
  githubUrl.searchParams.set("redirect_uri", callbackUrl);
  githubUrl.searchParams.set("scope", "read:user user:email");
  githubUrl.searchParams.set("state", state);

  return res.redirect(githubUrl.toString());
}

export async function handleCallback(req: Request, res: Response) {
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    return res.status(400).json({ status: "error", message: `GitHub OAuth error: ${error}` });
  }
  if (!code || !state) {
    return res.status(400).json({ status: "error", message: "Missing code or state" });
  }

  const pending = pendingStates.get(state);
  if (!pending || pending.expires < Date.now()) {
    return res.status(400).json({ status: "error", message: "Invalid or expired state" });
  }
  pendingStates.delete(state);

  try {
    const callbackUrl = `${req.protocol}://${req.get("host")}/auth/github/callback`;
    const githubToken = await exchangeGitHubCode(code, callbackUrl);
    const githubUser = await getGitHubUser(githubToken);
    const user = await upsertUser(githubUser);
    const tokens = await issueTokens(user);

    const clientRedirect = pending.redirect_uri;
    const isCLI = clientRedirect.startsWith("http://localhost") || clientRedirect.startsWith("http://127.0.0.1");

    if (isCLI) {
      const dest = new URL(clientRedirect);
      dest.searchParams.set("access_token", tokens.access_token);
      dest.searchParams.set("refresh_token", tokens.refresh_token);
      dest.searchParams.set("username", user.username);
      return res.redirect(dest.toString());
    }

    // Web flow: set HTTP-only cookies
    const cookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
    };
    res.cookie("access_token", tokens.access_token, { ...cookieOpts, maxAge: 3 * 60 * 1000 });
    res.cookie("refresh_token", tokens.refresh_token, { ...cookieOpts, maxAge: 5 * 60 * 1000 });

    const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3001";
    return res.redirect(`${frontendUrl}/dashboard`);
  } catch (err: any) {
    return res.status(500).json({ status: "error", message: err.message ?? "Authentication failed" });
  }
}

export async function refreshToken(req: Request, res: Response) {
  const tokenFromBody = req.body?.refresh_token;
  const tokenFromCookie = req.cookies?.refresh_token;
  const token = tokenFromBody ?? tokenFromCookie;

  if (!token) {
    return res.status(401).json({ status: "error", message: "Refresh token required" });
  }

  try {
    const tokens = await rotateRefreshToken(token);
    const isWebRequest = !tokenFromBody && tokenFromCookie;

    if (isWebRequest) {
      const cookieOpts = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax" as const,
        path: "/",
      };
      res.cookie("access_token", tokens.access_token, { ...cookieOpts, maxAge: 3 * 60 * 1000 });
      res.cookie("refresh_token", tokens.refresh_token, { ...cookieOpts, maxAge: 5 * 60 * 1000 });
      return res.status(200).json({ status: "success" });
    }

    return res.status(200).json({ status: "success", ...tokens });
  } catch (err: any) {
    return res.status(err.code ?? 500).json({ status: "error", message: err.message ?? "Token refresh failed" });
  }
}

export async function logout(req: Request, res: Response) {
  const tokenFromBody = req.body?.refresh_token;
  const tokenFromCookie = req.cookies?.refresh_token;
  const token = tokenFromBody ?? tokenFromCookie;

  if (token) {
    await invalidateRefreshToken(token);
  }

  res.clearCookie("access_token", { path: "/" });
  res.clearCookie("refresh_token", { path: "/" });

  return res.status(200).json({ status: "success", message: "Logged out" });
}

export async function whoami(req: Request, res: Response) {
  return res.status(200).json({ status: "success", data: req.user });
}
