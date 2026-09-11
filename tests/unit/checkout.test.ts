import {describe,it,expect} from 'vitest';
import {shippingPrice,validatePickup} from '@/domain/checkout';
import {validateEvidence} from '@/domain/evidence';
describe('checkout boundaries',()=>{
 it('rejects unsupported destinations',()=>expect(()=>shippingPrice([{countryCodes:['US'],rateCents:500,freeThresholdCents:null}],'CA',100)).toThrow());
 it('rejects past, closed, and malformed pickup slots',()=>{
  const location={weeklySchedule:{mon:[['09:00','17:00'] as [string,string]]},blackoutDates:[],prepMinutes:60};
  expect(()=>validatePickup(location,'2026-09-07','09:00','UTC',new Date('2026-09-07T08:30:00Z'))).toThrow();
  expect(()=>validatePickup(location,'2026-09-08','09:00','UTC',new Date('2026-09-07T08:30:00Z'))).toThrow();
  expect(()=>validatePickup(location,'2026-09-07','99:99','UTC')).toThrow();
  expect(validatePickup(location,'2026-09-07','09:00','UTC',new Date('2026-09-07T07:00:00Z'))).toEqual({date:'2026-09-07',startTime:'09:00',endTime:'17:00'});
 });
 it('validates candidate bytes, exact size and MIME',()=>{
  const png=Uint8Array.from([137,80,78,71,13,10,26,10]);
  expect(validateEvidence(png,100,100,'image/png','image/png')).toBe('image/png');
  expect(()=>validateEvidence(png,100,100,'image/jpeg','image/jpeg')).toThrow();
  expect(()=>validateEvidence(png,101,100,'image/png','image/png')).toThrow();
  expect(()=>validateEvidence(png,5*1024*1024,5*1024*1024,'image/png','image/png')).toThrow();
 });
});

