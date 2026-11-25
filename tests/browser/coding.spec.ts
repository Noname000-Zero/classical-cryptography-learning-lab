import { test, expect, type Page } from '@playwright/test';
async function openArena(page:Page){
  await page.goto('/');
  if(await page.getByRole('button',{name:'Mở điều hướng',exact:true}).isVisible())await page.getByRole('button',{name:'Mở điều hướng',exact:true}).click();
  await page.getByRole('button',{name:'Đấu trường C++',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Vào sân là lập trình.'})).toBeVisible();
  await expect(page.locator('.monaco-editor textarea.inputarea')).toBeAttached();
}
async function code(page:Page,value:string){
  const editor=page.locator('.monaco-editor textarea.inputarea');await editor.focus();await page.keyboard.press('Control+A');await page.keyboard.insertText(value);
}
const correct='#include <bits/stdc++.h>\nint main(){char c;int k;std::cin>>c>>k;k=(k%26+26)%26;std::cout<<char(\'a\'+(c-\'a\'+k)%26);}';
test('Actual desktop workflow: edit, compiler marker, shortcut run, submit XP once, logic suspicion, stop, draft/modes/reset',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await openArena(page);
  const bad='#include <iostream>\nint main(){std::cout<<1}';await code(page,bad);await page.keyboard.press('Control+Enter');
  await expect(page.getByRole('heading',{name:'Lỗi biên dịch',exact:true})).toBeVisible({timeout:30000});
  await expect(page.getByRole('button',{name:/Lỗi · dòng 2, cột/})).toBeVisible();
  await expect(page.locator('.monaco-editor .squiggly-error').first()).toBeVisible();
  await page.screenshot({path:info.outputPath('desktop-compiler-error.png')});
  expect((await(await page.request.get('/api/cards/card-caesar-character')).json()).card.progress.code).toBe(bad);
  await code(page,correct);await page.getByLabel('Stdin chạy thử').fill('x 3');await page.getByRole('button',{name:/^Chạy thử/}).click();
  await expect(page.getByRole('heading',{name:'Chạy thành công',exact:true})).toBeVisible({timeout:30000});await expect(page.getByTestId('stdout')).toHaveText('a');
  expect((await(await page.request.get('/api/bootstrap')).json()).stats.xp).toBe(0);
  await page.locator('.monaco-editor textarea.inputarea').focus();await page.keyboard.press('Control+Shift+Enter');
  await expect(page.getByRole('heading',{name:'GHI BÀN · Vượt bộ test',exact:true})).toBeVisible({timeout:30000});await expect(page.getByTestId('runner-results')).toContainText('+20 XP');
  await page.screenshot({path:info.outputPath('desktop-accepted.png')});
  await page.getByRole('button',{name:/^Nộp bài/}).click();
  await expect.poll(async()=>(await(await page.request.get('/api/cards/card-caesar-character')).json()).card.progress.attempts,{timeout:30000}).toBe(2);
  expect((await(await page.request.get('/api/bootstrap')).json()).stats.xp).toBe(20);
  await page.getByRole('button',{name:'Thẻ tiếp theo',exact:true}).click();
  const wrong='#include <iostream>\n#include <string>\nint main(){std::string s;int k;std::getline(std::cin,s);std::cin>>k;for(int i=0;i<(int)s.size();i++)s[i]=(s[i]+k)%26;std::cout<<s;}';
  await code(page,wrong);await page.getByRole('button',{name:/^Nộp bài/}).click();
  await expect(page.getByRole('heading',{name:'Sai kết quả',exact:true})).toBeVisible({timeout:30000});await expect(page.getByRole('button',{name:/Vị trí nghi vấn/})).toBeVisible();
  await page.getByRole('button',{name:'Thẻ trước',exact:true}).click();
  await expect.poll(async()=>(await(await page.request.get('/api/cards/card-caesar-character')).json()).card.progress.code).toBe(correct);
  await page.reload();await page.getByRole('button',{name:'Đấu trường C++',exact:true}).click();await expect(page.locator('.monaco-editor textarea.inputarea')).toBeAttached();
  await page.getByRole('button',{name:'Thi đấu · Match',exact:true}).click();await code(page,'// match draft');
  await expect.poll(async()=>(await(await page.request.get('/api/cards/card-caesar-character?mode=match')).json()).card.progress.code).toBe('// match draft');
  await page.getByRole('button',{name:'Reset code',exact:true}).click();await page.getByRole('button',{name:'Hoàn tác Reset',exact:true}).click();
  await expect.poll(async()=>(await(await page.request.get('/api/cards/card-caesar-character?mode=match')).json()).card.progress.code).toBe('// match draft');
  await code(page,'int main(){while(true){}}');await page.getByRole('button',{name:/^Chạy thử/}).click();await expect(page.getByRole('button',{name:'Dừng',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Dừng',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Đã dừng',exact:true})).toBeVisible({timeout:15000});
  await page.getByRole('button',{name:'Kiểm tra · Exam',exact:true}).click();await expect(page.getByRole('heading',{name:'Chung kết: tự viết từ đầu',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Gợi ý 1/3',exact:true})).toBeDisabled();
  expect(errors).toEqual([]);
});

for(const width of [1920,1366,768,375])test(`Actual browser layout ${width}px, keyboard editor and no horizontal document overflow`,async({page},info)=>{
  await page.setViewportSize({width,height:900});await openArena(page);
  await expect(page.getByRole('button',{name:/^Chạy thử/})).toBeEnabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath(`arena-${width}.png`)});
  if(width===375){await code(page,correct);await page.getByLabel('Stdin chạy thử').fill('a 3');await page.getByRole('button',{name:/^Chạy thử/}).click();await expect(page.getByRole('heading',{name:'Chạy thành công',exact:true})).toBeVisible({timeout:30000});await expect(page.getByTestId('stdout')).toHaveText('d');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);}
});
