import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyJwt, JwtPayload } from '../utils/jwt.js';

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const authHeader = request.headers['authorization'];
  console.log('authing...');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply
      .code(401)
      .send({
        error: 'Missing or invalid Authorization header',
        code: 'AUTH_REQUIRED'
      });
  }
  const token = authHeader.slice(7); // Remove 'Bearer '
  const payload = verifyJwt(token);
  if (!payload) {
    return reply
      .code(401)
      .send({ error: 'Invalid or expired token', code: 'TOKEN_EXPIRED' });
  }
  // Attach user info to request for downstream handlers
  (request as any).user = payload;
}
