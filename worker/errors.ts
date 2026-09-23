export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string, details?: unknown) => new ApiError(400, code, message, details);
export const notFound = (code: string, message: string) => new ApiError(404, code, message);

/**
 * A deleted account stays deleted: no claim, no attach, no reset, no rename and no picks entered
 * for it. 410 rather than 404 because the row is still there — its picks are on the board — and
 * the honest answer is that it is gone on purpose.
 */
export function refuseDeleted(player: { deletedAt: string | null }): void {
  if (player.deletedAt) throw new ApiError(410, "DELETED_PLAYER", "That account was deleted.");
}
