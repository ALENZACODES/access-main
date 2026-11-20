// Local test-only stand-in for the preexisting main helper. NOT INCLUDED IN ZIP.
const LICENCES = new Set(['CC0-1.0','CC-BY-4.0','CC-BY-SA-4.0','ODbL-1.0','OGL-Canada-2.0','OGL-Ontario-1.0','MIT','Apache-2.0']);
export function isOpenLicence(value) { return typeof value==='string' && LICENCES.has(value); }
export function isValidDate(value) {
 if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
 const [year,month,day]=value.split('-').map(Number);if(year<1||year>9999)return false;
 const date=new Date(0);date.setUTCHours(0,0,0,0);date.setUTCFullYear(year,month-1,day);
 return date.getUTCFullYear()===year && date.getUTCMonth()===month-1 && date.getUTCDate()===day;
}
