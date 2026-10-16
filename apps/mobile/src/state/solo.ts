import type { SetResultDto, SetSessionDto } from '@zuirock/shared';

/** Hand-off from the solo play screen to its result screen (in memory only). */
export const soloResult: { set: SetSessionDto | null; result: SetResultDto | null } = { set: null, result: null };
