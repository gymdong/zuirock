import type { PlacementResultDto, SetResultDto, SetSessionDto } from '@zuirock/shared';

/** Hand-off from the solo play screen to its result screens (in memory only). */
export const soloResult: {
  set: SetSessionDto | null;
  result: SetResultDto | null;
  placement: PlacementResultDto | null;
} = { set: null, result: null, placement: null };
