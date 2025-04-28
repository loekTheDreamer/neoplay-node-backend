import jwt from 'jsonwebtoken';
import { config } from '../config/env';

const JWT_SECRET = process.env.JWT_SECRET || config.sessionSecret || 'default_secret';
const JWT_EXPIRES_IN = '7d'; // 7 days

const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || config.sessionSecret || 'default_refresh_secret';
const REFRESH_TOKEN_EXPIRES_IN = '30d'; // 30 days

export interface JwtPayload {
  id: string;
  address: string;
}

export function signJwt(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });
}

export function verifyJwt(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch (err) {
    return null;
  }
}

export function verifyRefreshToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, REFRESH_TOKEN_SECRET) as JwtPayload;
  } catch (err) {
    return null;
  }
}
