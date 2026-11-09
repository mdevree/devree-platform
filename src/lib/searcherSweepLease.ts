export const SWEEP_INTERVAL = 6 * 60 * 60 * 1000;
export const SWEEP_LEASE = 10 * 60 * 1000;
export type SweepState = {ids:string[]; index:number; phase:string; page:number; startedAt:string};
export type SweepLease = {owner?:string; token?:string; expiresAt?:number; nextRunAt?:number; state?:SweepState|null};
export function claimSweep(current:SweepLease, owner:string, now:number, token:string) {
  if ((current.nextRunAt || 0) > now || ((current.expiresAt || 0) > now && current.owner !== owner)) return null;
  return {...current,owner,token:current.owner===owner && (current.expiresAt||0)>now ? current.token : token,expiresAt:now+SWEEP_LEASE};
}
export function ownsSweep(current:SweepLease, owner:string, token:string, now:number) {
  return current.owner===owner && current.token===token && (current.expiresAt||0)>now;
}
