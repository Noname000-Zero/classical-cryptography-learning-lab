// Remains alive across screen changes so backup/restore can wait for card writes.
let writes: Promise<unknown> = Promise.resolve();
export function enqueueCardWrite(work:()=>Promise<unknown>) {
  const job=writes.catch(()=>{}).then(work);writes=job;return job;
}
export async function flushCardWrites() {
  const jobs:Promise<unknown>[]=[];
  window.dispatchEvent(new CustomEvent('academy:flush-drafts',{detail:{jobs}}));
  await Promise.all(jobs);await writes;
}
