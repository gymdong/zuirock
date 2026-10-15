/**
 * room-cas.lua — kept as a TS string so `nest build` ships it without asset config.
 *
 * KEYS[1] = room state hash (fields `v` version, `d` JSON), KEYS[2] = lease key
 * ARGV[1] = expected version, ARGV[2] = new JSON, ARGV[3] = owner instance id, ARGV[4] = state TTL ms
 * Returns the new version, -1 on version conflict, -2 when the caller does not hold the lease,
 * -3 when the room is gone.
 */
export const ROOM_CAS_LUA = `
if redis.call('GET', KEYS[2]) ~= ARGV[3] then return -2 end
local v = redis.call('HGET', KEYS[1], 'v')
if not v then return -3 end
if tonumber(v) ~= tonumber(ARGV[1]) then return -1 end
local nv = tonumber(ARGV[1]) + 1
redis.call('HSET', KEYS[1], 'v', nv, 'd', ARGV[2])
redis.call('PEXPIRE', KEYS[1], ARGV[4])
return nv
`;

/** KEYS[1] = lease; ARGV[1] = owner, ARGV[2] = ttl ms. 1 if renewed, 0 if lost. */
export const LEASE_RENEW_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) end
return 0
`;

/** KEYS[1] = lease; ARGV[1] = owner. Deletes only our own lease. */
export const LEASE_RELEASE_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
`;
