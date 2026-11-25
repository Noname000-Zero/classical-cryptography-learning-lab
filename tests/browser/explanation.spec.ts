import { test, expect, type Page } from '@playwright/test';
async function open(page: Page) {
  await page.goto('/');
  if (await page.getByRole('button', { name: 'Mở điều hướng', exact: true }).isVisible()) await page.getByRole('button', { name: 'Mở điều hướng', exact: true }).click();
  await page.getByRole('button', { name: 'Đấu trường C++', exact: true }).click();
  await expect(page.locator('.monaco-editor textarea.inputarea')).toBeAttached();
}
async function code(page: Page, value: string) {
  await page.locator('.monaco-editor textarea.inputarea').focus();
  await page.keyboard.press('Control+A'); await page.keyboard.insertText(value);
}
const program = '#include <iostream>\n#include <string>\nint main(){\nstd::string s; int k;\nstd::getline(std::cin,s); std::cin>>k;\nfor(int i=0;i<(int)s.size();i++){\ns[i]=(s[i]-\'a\'+k)%26+\'a\';\n}\nstd::cout<<s;\n}';

test('read source and rewind independent Caesar model; preserve draft and keep coding in same screen', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await open(page); await page.getByRole('button', { name: 'Thẻ tiếp theo', exact: true }).click();
  await code(page, program); await page.getByLabel('Stdin chạy thử').fill('abc\n3');
  await expect(page.getByTestId('code-explanation')).toHaveCount(0);
  await page.getByRole('button', { name: 'Giải thích từng bước', exact: true }).click();
  const panel = page.getByTestId('code-explanation');
  await expect(page.getByLabel('Mức giải thích')).toHaveValue('basic');
  await expect(page.getByTestId('reading-step')).toContainText('Dòng 1');
  await expect(page.locator('.monaco-editor .static-reading-line')).toHaveCount(1);
  await page.getByRole('button', { name: 'Bước tiếp theo', exact: true }).click();
  await expect(page.getByTestId('reading-step')).toContainText('Dòng 2');
  await page.getByLabel('Chế độ giải thích', { exact: true }).selectOption('simulation');
  await expect(panel).toContainText('độc lập với mã đang viết');
  await expect(page.locator('.monaco-editor .static-reading-line')).toHaveCount(0);
  for (const [position, value] of [[2, 'dbc'], [5, 'dec'], [8, 'def']] as const) {
    await page.getByLabel('Timeline giải thích').fill(String(position));
    await expect(page.getByTestId('simulation-step')).toContainText(`chuỗi "${value}"`);
  }
  await page.getByRole('button', { name: 'Quay lại bước trước', exact: true }).click();
  await expect(page.getByTestId('simulation-step')).toContainText('kiểm tra');
  await page.getByRole('button', { name: 'Tua về đầu', exact: true }).click();
  await expect(page.getByTestId('simulation-step')).toContainText('Khởi tạo');
  await page.getByLabel('Timeline giải thích').fill('5');
  await page.getByLabel('Mức giải thích').selectOption('advanced');
  await expect(page.getByTestId('simulation-step')).toContainText('O(n)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('caesar-step-variables.png') });
  await page.getByLabel('Khóa mô hình').fill('not a key');
  await expect(panel.getByRole('alert')).toContainText('khóa nguyên');
  await page.getByLabel('Khóa mô hình').fill('3');
  await page.getByLabel('Chế độ giải thích', { exact: true }).selectOption('static');
  await code(page, program + '\n// keep learning');
  await expect(panel).toContainText('Code đã thay đổi');
  await expect(page.locator('.monaco-editor .static-reading-line')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Đọc lại code hiện tại', exact: true }).last().click();
  await expect(page.locator('.monaco-editor .static-reading-line')).toHaveCount(1);
  await page.getByRole('button', { name: 'Đóng giải thích', exact: true }).click();
  await expect(page.getByTestId('code-explanation')).toHaveCount(0);
  await page.getByRole('button', { name: /^Chạy thử/ }).click();
  await expect(page.getByTestId('stdout')).toHaveText('def', { timeout: 30000 });
  await expect.poll(async () => (await (await page.request.get('/api/cards/card-caesar-lowercase')).json()).card.progress.code).toBe(program + '\n// keep learning');
  await expect(page.getByTestId('code-explanation')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('real syntax and wrong-answer evidence; stale diagnostics cannot jump into new source', async ({ page }) => {
  await open(page); await code(page, '#include <iostream>\nint main(){std::cout<<1}');
  await page.getByRole('button', { name: /^Chạy thử/ }).click();
  await expect(page.getByRole('heading', { name: 'Lỗi biên dịch', exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Giải thích từng bước', exact: true }).click();
  const panel = page.getByTestId('code-explanation');
  await expect(panel.getByRole('button', { name: /Diagnostic compiler thật · dòng 2/ }).first()).toBeEnabled();
  await code(page, 'int main(){}');
  await expect(panel).toContainText('Kết quả thuộc bản code trước');
  await expect(panel.getByRole('button', { name: /Diagnostic compiler thật · dòng 2/ }).first()).toBeDisabled();
  await page.getByRole('button', { name: 'Thẻ tiếp theo', exact: true }).click();
  await expect(panel).toHaveCount(0);
  await code(page, program.replace("s[i]-'a'+k", 's[i]+k').replace("%26+'a'", '%26'));
  await page.getByRole('button', { name: /^Nộp bài/ }).click();
  await expect(page.getByRole('heading', { name: 'Sai kết quả', exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Giải thích từng bước', exact: true }).click();
  await expect(panel).toContainText('Khác đầu tiên ở vị trí');
  await expect(panel).toContainText('chưa đủ để xác định chính xác dòng lỗi');
  await expect(panel.getByRole('button', { name: /Vị trí nghi vấn/ }).first()).toBeVisible();
});

test('mobile panel fits and other lessons receive static reading rather than Caesar simulation', async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 900 }); await open(page);
  await page.getByRole('button', { name: 'Giải thích từng bước', exact: true }).click();
  await page.getByLabel('Chế độ giải thích', { exact: true }).selectOption('simulation');
  await page.getByRole('button', { name: 'Ví dụ abc, k = 3', exact: true }).click();
  await page.getByLabel('Timeline giải thích').fill('2');
  await expect(page.getByTestId('simulation-step')).toContainText('dbc');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('explanation-mobile-375.png') });
  await page.getByLabel('Bộ thẻ', { exact: true }).selectOption('affine');
  await expect(page.getByRole('heading', { name: 'Tìm nghịch đảo modulo', exact: true })).toBeVisible();
  await expect(page.getByTestId('code-explanation')).toHaveCount(0);
  await page.getByRole('button', { name: 'Giải thích từng bước', exact: true }).click();
  await expect(page.getByLabel('Chế độ giải thích', { exact: true }).locator('option')).toHaveCount(1);
  await code(page, 'custom_algorithm(data);');
  await page.getByTestId('code-explanation').getByRole('button', { name: 'Đọc lại code hiện tại', exact: true }).last().click();
  await expect(page.getByTestId('reading-step')).toContainText('chưa suy ra hành vi');
});
