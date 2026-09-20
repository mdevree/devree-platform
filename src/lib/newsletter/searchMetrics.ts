import { normalizeKeyword, sensitiveKeyword } from './rules';

export type SearchRow = {label:string;nb_hits?:number;nb_visits?:number;nb_events?:number;subtable?:SearchRow[]};
export function aggregate(rows:SearchRow[]){
 const result=new Map<string,number>();
 for(const row of rows){
  const key=normalizeKeyword(row.label||'');
  if(key.length<2||sensitiveKeyword(key))continue;
  const count=Number(row.nb_hits??row.nb_visits??0);
  if(Number.isFinite(count)&&count>=0)result.set(key,(result.get(key)||0)+count);
 }
 return result;
}
export function noResultKeywords(rows:SearchRow[]){
 const category=rows.find(row=>row.label==='FAQ zonder resultaat');
 if(!category)return new Map<string,number>();
 if(!Array.isArray(category.subtable))throw new Error('Matomo mist de zoektermen bij nulresultaten.');
 return aggregate(category.subtable.map(row=>({...row,nb_hits:row.nb_events??0})));
}
