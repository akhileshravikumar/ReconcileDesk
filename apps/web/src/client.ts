export interface User {id:string;email:string;displayName:string;role:'VIEWER'|'OPERATOR'}
let csrfToken='';
export function setCsrfToken(value:string){csrfToken=value;}
export class ApiError extends Error {constructor(message:string,public status:number){super(message);}}
export async function request<T>(path:string,options?:RequestInit):Promise<T> {
  const headers=new Headers(options?.headers);headers.set('x-reconciledesk-client','web');
  if(options?.method&&!['GET','HEAD'].includes(options.method))headers.set('x-csrf-token',csrfToken);
  const response=await fetch(path,{...options,headers,credentials:'same-origin',signal:AbortSignal.timeout(options?.method?150000:10000)});
  const data=response.status===204?null:await response.json();
  if(!response.ok){if(response.status===401&&path!=='/api/auth/login')window.dispatchEvent(new Event('session-expired'));throw new ApiError(data?.error??`Request failed (${response.status})`,response.status);}
  return data as T;
}
