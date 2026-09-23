/** Reserve durably BEFORE remote I/O. If remote work or database acknowledgment
 * is uncertain, reservation remains unsettled; deletion must fail closed. */
export async function admittedUpload<T>(deps:{reserve():Promise<void>;underAccountLock(work:()=>Promise<T>):Promise<T>;upload():Promise<T>;settle():Promise<void>}):Promise<T> {
 await deps.reserve();
 return deps.underAccountLock(async()=>{const result=await deps.upload();await deps.settle();return result;});
}
