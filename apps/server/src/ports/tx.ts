import type { Prisma } from '@prisma/client';

/**
 * Transaction client passed to every port. All four ports are called inside one
 * `prisma.$transaction` opened by the caller (e.g. LC's room-result.service), so a battle result,
 * its solve logs, XP, wrong notes and streak commit or roll back together.
 */
export type Tx = Prisma.TransactionClient;
