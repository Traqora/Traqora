import { AppDataSource } from './dataSource';
import { DashboardComment, CommentTarget } from './entities/DashboardComment';
import { DashboardShare, SharePermission } from './entities/DashboardShare';
import crypto from 'crypto';

// ── Comments ─────────────────────────────────────────────────────────────────

export interface CreateCommentInput {
  dashboardId: string;
  target?: string;
  targetType?: CommentTarget;
  authorWallet: string;
  authorName?: string;
  body: string;
  parentId?: string;
  tenantId?: string;
}

export async function createComment(input: CreateCommentInput): Promise<DashboardComment> {
  const repo = AppDataSource.getRepository(DashboardComment);
  const comment = repo.create({
    dashboardId: input.dashboardId,
    target: input.target ?? null,
    targetType: input.targetType ?? 'dashboard',
    authorWallet: input.authorWallet,
    authorName: input.authorName ?? null,
    body: input.body,
    parentId: input.parentId ?? null,
    resolved: false,
    tenantId: input.tenantId ?? null,
  });
  return repo.save(comment);
}

export async function listComments(
  dashboardId: string,
  opts?: { target?: string; tenantId?: string; includeResolved?: boolean }
): Promise<DashboardComment[]> {
  const repo = AppDataSource.getRepository(DashboardComment);
  const qb = repo.createQueryBuilder('c').where('c.dashboardId = :dashboardId', { dashboardId });

  if (opts?.target) qb.andWhere('c.target = :target', { target: opts.target });
  if (opts?.tenantId) qb.andWhere('c.tenantId = :tenantId', { tenantId: opts.tenantId });
  if (!opts?.includeResolved) qb.andWhere('c.resolved = false');

  return qb.orderBy('c.createdAt', 'ASC').getMany();
}

export async function resolveComment(id: string, requesterWallet: string): Promise<boolean> {
  const repo = AppDataSource.getRepository(DashboardComment);
  const comment = await repo.findOne({ where: { id } });
  if (!comment || comment.authorWallet !== requesterWallet) return false;
  comment.resolved = true;
  await repo.save(comment);
  return true;
}

export async function deleteComment(id: string, requesterWallet: string): Promise<boolean> {
  const repo = AppDataSource.getRepository(DashboardComment);
  const comment = await repo.findOne({ where: { id } });
  if (!comment || comment.authorWallet !== requesterWallet) return false;
  await repo.delete(id);
  return true;
}

// ── Sharing ───────────────────────────────────────────────────────────────────

export interface CreateShareInput {
  dashboardId: string;
  createdBy: string;
  permission?: SharePermission;
  allowedWallets?: string[];
  expiresAt?: Date;
  tenantId?: string;
}

export async function createShare(input: CreateShareInput): Promise<DashboardShare> {
  const repo = AppDataSource.getRepository(DashboardShare);
  const shareToken = crypto.randomBytes(24).toString('base64url');
  const share = repo.create({
    dashboardId: input.dashboardId,
    createdBy: input.createdBy,
    shareToken,
    permission: input.permission ?? 'view',
    allowedWallets: input.allowedWallets ?? [],
    expiresAt: input.expiresAt ?? null,
    tenantId: input.tenantId ?? null,
    isActive: true,
  });
  return repo.save(share);
}

export async function resolveShareToken(token: string): Promise<DashboardShare | null> {
  const repo = AppDataSource.getRepository(DashboardShare);
  const share = await repo.findOne({ where: { shareToken: token, isActive: true } });
  if (!share) return null;
  if (share.expiresAt && share.expiresAt < new Date()) return null;
  return share;
}

export async function listShares(dashboardId: string, createdBy?: string): Promise<DashboardShare[]> {
  const repo = AppDataSource.getRepository(DashboardShare);
  const qb = repo.createQueryBuilder('s').where('s.dashboardId = :dashboardId', { dashboardId });
  if (createdBy) qb.andWhere('s.createdBy = :createdBy', { createdBy });
  return qb.orderBy('s.createdAt', 'DESC').getMany();
}

export async function revokeShare(id: string, requesterWallet: string): Promise<boolean> {
  const repo = AppDataSource.getRepository(DashboardShare);
  const share = await repo.findOne({ where: { id } });
  if (!share || share.createdBy !== requesterWallet) return false;
  share.isActive = false;
  await repo.save(share);
  return true;
}

// ── Activity Feed ─────────────────────────────────────────────────────────────

export async function getActivityFeed(
  dashboardId: string,
  tenantId?: string,
  limit = 50
): Promise<Array<{ type: string; item: DashboardComment | DashboardShare; at: Date }>> {
  const [comments, shares] = await Promise.all([
    listComments(dashboardId, { tenantId, includeResolved: true }),
    listShares(dashboardId),
  ]);

  const feed: Array<{ type: string; item: DashboardComment | DashboardShare; at: Date }> = [
    ...comments.map((c) => ({ type: 'comment', item: c, at: c.createdAt })),
    ...shares.map((s) => ({ type: 'share', item: s, at: s.createdAt })),
  ];

  return feed.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}
