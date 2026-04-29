import axios from "axios";
import { randomBytes, createHash } from "crypto";
import jwt from "jsonwebtoken";
import db from "./db";

function uuidv7(): string {
  const now = Date.now();
  const buf = randomBytes(16);
  buf[0] = (now / 2 ** 40) & 0xff;
  buf[1] = (now / 2 ** 32) & 0xff;
  buf[2] = (now / 2 ** 24) & 0xff;
  buf[3] = (now / 2 ** 16) & 0xff;
  buf[4] = (now / 2 **  8) & 0xff;
  buf[5] =  now             & 0xff;
  buf[6] = (buf[6] & 0x0f) | 0x70;
  buf[8] = (buf[8] & 0x3f) | 0x80;
  const h = buf.toString("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

export async function exchangeGitHubCode(code: string, redirectUri: string): Promise<string> {
  const res = await axios.post(
    "https://github.com/login/oauth/access_token",
    {
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    },
    { headers: { Accept: "application/json" } }
  );

  if (res.data.error || !res.data.access_token) {
    throw new Error(res.data.error_description ?? "GitHub token exchange failed");
  }

  return res.data.access_token;
}

export async function getGitHubUser(accessToken: string) {
  const [userRes, emailsRes] = await Promise.allSettled([
    axios.get("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    axios.get("https://api.github.com/user/emails", {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  ]);

  if (userRes.status === "rejected") throw new Error("Failed to fetch GitHub user");

  const user = userRes.value.data;
  let email = user.email ?? "";

  if (!email && emailsRes.status === "fulfilled") {
    const primary = emailsRes.value.data.find((e: any) => e.primary && e.verified);
    email = primary?.email ?? emailsRes.value.data[0]?.email ?? "";
  }

  return {
    github_id: String(user.id),
    username: user.login,
    email,
    avatar_url: user.avatar_url ?? "",
  };
}

export async function upsertUser(githubUser: {
  github_id: string;
  username: string;
  email: string;
  avatar_url: string;
}) {
  return db.user.upsert({
    where: { github_id: githubUser.github_id },
    update: {
      username: githubUser.username,
      email: githubUser.email,
      avatar_url: githubUser.avatar_url,
      last_login_at: new Date(),
    },
    create: {
      id: uuidv7(),
      github_id: githubUser.github_id,
      username: githubUser.username,
      email: githubUser.email,
      avatar_url: githubUser.avatar_url,
      role: "analyst",
      is_active: true,
      last_login_at: new Date(),
    },
  });
}

export async function issueTokens(user: { id: string; role: string; username: string; is_active: boolean }) {
  const accessToken = jwt.sign(
    { id: user.id, role: user.role, username: user.username, is_active: user.is_active },
    process.env.JWT_SECRET!,
    { expiresIn: "3m" }
  );

  const refreshTokenValue = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await db.refreshToken.create({
    data: {
      id: uuidv7(),
      token: refreshTokenValue,
      user_id: user.id,
      expires_at: expiresAt,
    },
  });

  return { access_token: accessToken, refresh_token: refreshTokenValue };
}

export async function rotateRefreshToken(token: string) {
  const stored = await db.refreshToken.findUnique({ where: { token }, include: { user: true } });

  if (!stored) throw { code: 401, message: "Invalid refresh token" };
  if (stored.expires_at < new Date()) {
    await db.refreshToken.delete({ where: { token } });
    throw { code: 401, message: "Refresh token expired" };
  }

  await db.refreshToken.delete({ where: { token } });

  return issueTokens(stored.user);
}

export async function invalidateRefreshToken(token: string) {
  await db.refreshToken.deleteMany({ where: { token } });
}
