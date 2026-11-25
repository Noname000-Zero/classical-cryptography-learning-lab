import {test,expect,type Page} from '@playwright/test';
async function open(page:Page){await page.goto('/');if(await page.getByRole('button',{name:'Mở điều hướng',exact:true}).isVisible())await page.getByRole('button',{name:'Mở điều hướng',exact:true}).click();await page.getByRole('button',{name:'Đấu trường C++',exact:true}).click();await expect(page.locator('.monaco-editor textarea.inputarea')).toBeAttached();}
test('Disconnected tutor is honest, preserves code and fits mobile',async({page},info)=>{
  await page.setViewportSize({width:375,height:900});await open(page);await page.getByRole('button',{name:'Gia sư AI',exact:true}).click();const tutor=page.getByRole('complementary',{name:'Gia sư AI',exact:true});
  await expect(tutor).toContainText('Gia sư AI chưa kết nối');await page.getByLabel('Câu hỏi cho gia sư').fill('Tôi sai ở đâu?');await expect(page.getByRole('button',{name:'Gửi câu hỏi',exact:true})).toBeDisabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('tutor-mobile.png')});
  await page.getByRole('button',{name:'Thu gọn gia sư'}).click();await expect(tutor).toHaveCount(0);
});
test('Mock adapter UI only: consent, multi-turn, card persistence and selection; no real LLM acceptance claim',async({page},info)=>{
  await page.route('**/api/tutor/status',r=>r.fulfill({json:{configured:true,model:'MOCK TEST ONLY',provider:'local-test'}}));
  const sent:any[]=[];await page.route('**/api/cards/*/tutor',async r=>{sent.push(r.request().postDataJSON());await r.fulfill({json:{reply:'Phản hồi MOCK của test. Hãy kiểm tra dòng 1.',source:sent.at(-1).code}})});
  await open(page);const editor=page.locator('.monaco-editor textarea.inputarea');await editor.focus();await page.keyboard.press('Control+A');await page.keyboard.insertText('for(int i=0;i<3;i++);');
  await page.getByRole('button',{name:'Gia sư AI',exact:true}).click();await page.getByLabel('Câu hỏi cho gia sư').fill('Tôi sai ở đâu?');await expect(page.getByRole('button',{name:'Gửi câu hỏi',exact:true})).toBeDisabled();
  const consent=page.getByRole('checkbox',{name:/Tôi đồng ý gửi ngữ cảnh/});await consent.check();await page.getByRole('button',{name:'Gửi câu hỏi',exact:true}).click();await expect(page.getByLabel('Hội thoại gia sư')).toContainText('Phản hồi MOCK');expect(sent[0].code).toBe('for(int i=0;i<3;i++);');await expect(consent).not.toBeChecked();
  await page.getByLabel('Câu hỏi cho gia sư').fill('Giải thích lại đơn giản hơn');await consent.check();await page.getByRole('button',{name:'Gửi câu hỏi',exact:true}).click();await expect.poll(()=>sent.length).toBe(2);expect(sent[1].history).toHaveLength(2);
  await page.screenshot({path:info.outputPath('tutor-desktop.png')});
  await page.getByRole('button',{name:'Thẻ tiếp theo',exact:true}).click();await page.getByRole('button',{name:'Thẻ trước',exact:true}).click();await page.getByRole('button',{name:'Gia sư AI',exact:true}).click();await expect(page.getByLabel('Hội thoại gia sư')).toContainText('Giải thích lại đơn giản hơn');
  await editor.focus();await page.keyboard.press('Control+Home');await page.keyboard.press('Shift+End');await page.locator('.monaco-editor .view-lines').click({button:'right',position:{x:50,y:10}});
  await page.getByText('Hỏi gia sư về đoạn code này',{exact:true}).click();
  await expect(page.getByRole('complementary',{name:'Gia sư AI',exact:true})).toContainText('Đang hỏi đoạn chọn dòng');
  await consent.check();await page.getByRole('button',{name:'Gửi câu hỏi',exact:true}).click();await expect.poll(()=>sent.length).toBe(3);expect(sent[2].selection.text).toContain('for');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
