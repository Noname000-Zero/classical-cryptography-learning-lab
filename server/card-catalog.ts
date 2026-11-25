import { z } from 'zod';

export const cardModeSchema = z.enum(['training', 'match', 'exam']);
export const challengeCardSchema = z.object({
  id: z.string().min(1).max(180), lessonId: z.string().min(1), deck: z.string().min(1),
  ordinal: z.number().int().nonnegative(), kind: z.enum(['code', 'question', 'calculation', 'simulation']),
  title: z.string().min(1).max(300), goal: z.string().min(1).max(2000),
  difficulty: z.enum(['rookie', 'academy', 'professional']), xp: z.number().int().min(0).max(500),
  prompt: z.string().max(20000), samples: z.array(z.object({ input: z.string().max(10000), expected: z.string().max(10000) })).min(1).max(20),
  starterCode: z.string().max(100000), solution: z.string().max(100000),
  hints: z.tuple([z.string().max(10000), z.string().max(10000), z.string().max(10000)]),
  sourceReferences: z.array(z.string()).max(2000), supplemental: z.boolean(),
  theory: z.string().max(100000), formula: z.string().max(10000), examEligible: z.boolean().default(false),
  answer: z.string().max(10000).optional()
});
export type ChallengeCard = z.infer<typeof challengeCardSchema>;
type Lesson = { id: string; summary: string; source_references: string; content: string };
const program = (body: string) => `#include <iostream>\n#include <string>\n#include <algorithm>\nusing namespace std;\n\nint main() {\n${body.split('\n').map(s => '    ' + s).join('\n')}\n}\n`;
const starter = program('// Đọc dữ liệu và viết thuật toán tại đây.\nreturn 0;');
const input = 'string s;\nint k;\ngetline(cin, s);\ncin >> k;\nk = (k % 26 + 26) % 26;';
const shift = (s: string, k: string) => `for (char &c : ${s}) {\n    if (c >= 'a' && c <= 'z') c = char('a' + (c - 'a' + ${k} + 26) % 26);\n    else if (c >= 'A' && c <= 'Z') c = char('A' + (c - 'A' + ${k} + 26) % 26);\n}`;
const caesar = (s: string, k: number) => s.replace(/[a-z]/gi, c => { const a = c >= 'a' && c <= 'z' ? 97 : 65; return String.fromCharCode(a + ((c.charCodeAt(0) - a + k) % 26 + 26) % 26); });

// Editorial curriculum, never represented as verbatim slide exercises.
// Every card links to the existing, immutable source-reference IDs.
export function buildCardCatalog(lessons: Lesson[]): ChallengeCard[] {
  const cards: ChallengeCard[] = [];
  function add(lessonId: string, slug: string, title: string, prompt: string, samples: ChallengeCard['samples'], solution: string, hints: ChallengeCard['hints'], extra: Partial<ChallengeCard> = {}) {
    const lesson = lessons.find(l => l.id === lessonId); if (!lesson) return;
    const content = JSON.parse(lesson.content);
    cards.push(challengeCardSchema.parse({ id: `card-${lessonId}-${slug}`, lessonId, deck: lessonId, ordinal: cards.filter(c => c.lessonId === lessonId).length,
      kind: 'code', title, goal: title, difficulty: 'academy', xp: 50, prompt, samples, starterCode: starter, solution, hints,
      sourceReferences: JSON.parse(lesson.source_references), supplemental: true, theory: lesson.summary + '\n\n' + (content.example || ''), formula: content.formula || '', ...extra }));
  }
  add('caesar', 'character', 'Mã hóa một ký tự', 'Đọc một chữ thường a–z và khóa nguyên k (−1000000…1000000), cách nhau bởi khoảng trắng. In ký tự Caesar tương ứng.',
    [{ input: 'x 3', expected: 'a' }, { input: 'a -3', expected: 'x' }],
    program("char a; int k;\ncin >> a >> k;\nk = (k % 26 + 26) % 26;\ncout << char('a' + (a - 'a' + k) % 26);"),
    ['Đưa chữ cái về chỉ số bắt đầu từ 0.', 'Chuẩn hóa k về 0…25 rồi tính (P+k) mod26.', "k = (k % 26 + 26) % 26;\nchar b = char('a' + (a - 'a' + k) % 26);"], { difficulty: 'rookie', xp: 20 });
  add('caesar', 'lowercase', 'Mã hóa chuỗi chữ thường', 'Dòng 1: chuỗi chỉ gồm a–z, có thể rỗng. Dòng 2: khóa nguyên k (−1000000…1000000). In chuỗi mã hóa.',
    [{ input: 'xyz\n3', expected: 'abc' }, { input: 'hello\n3', expected: 'khoor' }, { input: '\n7', expected: '' }],
    program(input + "\nfor (char &c : s) c = char('a' + (c - 'a' + k) % 26);\ncout << s;"),
    ['Dùng vòng lặp xử lý từng ký tự.', 'getline đọc chuỗi; cin >> k đọc khóa ở dòng sau.', "for (char &c : s) c = char('a' + (c - 'a' + k) % 26);"]);
  add('caesar', 'mixed', 'Mã hóa hoa và thường', 'Dòng 1: chuỗi ASCII. Dòng 2: k (−1000000…1000000). Mã hóa A–Z/a–z riêng, giữ nguyên dấu câu, chữ số và dấu cách. Không yêu cầu xử lý chữ Việt có dấu.',
    [{ input: 'Hello, XYZ! 9\n3', expected: 'Khoor, ABC! 9' }, { input: 'Zz\n-1', expected: 'Yy' }],
    program(input + '\n' + shift('s', 'k') + '\ncout << s;'),
    ['Tách hai khoảng chữ hoa và chữ thường.', 'Chữ thường dùng mốc a, chữ hoa dùng mốc A; ngoài hai khoảng thì giữ nguyên.', "if (c >= 'A' && c <= 'Z') c = char('A' + (c - 'A' + k) % 26);"]);
  add('caesar', 'decrypt', 'Giải mã Caesar', 'Dòng 1: bản mã ASCII. Dòng 2: k (−1000000…1000000). Khôi phục bản rõ, giữ hoa/thường và dấu câu.',
    [{ input: 'Khoor, ABC!\n3', expected: 'Hello, XYZ!' }, { input: 'ABC\n29', expected: 'XYZ' }],
    program(input + '\n' + shift('s', '-k') + '\ncout << s;'),
    ['Đổi chiều dịch chuyển.', 'P=((C−k)%26+26)%26.', "c = char('a' + (c - 'a' - k + 26) % 26);"]);
  const full = program('string s, mode;\nint k;\ngetline(cin, s);\ncin >> k >> mode;\nk = (k % 26 + 26) % 26;\nif (mode == "D") k = (26 - k) % 26;\n' + shift('s', 'k') + '\ncout << s;');
  add('caesar', 'complete', 'Mã hóa và giải mã hoàn chỉnh', 'Dòng 1: chuỗi ASCII. Dòng 2: k và E (mã hóa) hoặc D (giải mã). Khóa trong −1000000…1000000. Giữ nguyên ký tự ngoài A–Z/a–z.',
    [{ input: 'Zebra!\n3 E', expected: 'Cheud!' }, { input: 'Cheud!\n3 D', expected: 'Zebra!' }], full,
    ['Dùng chung vòng lặp cho hai chiều.', 'D tương đương mã hóa với khóa (26−k)%26 sau chuẩn hóa.', 'if (mode == "D") k = (26 - k) % 26;'], { difficulty: 'professional', xp: 75 });
  add('caesar', 'brute', 'Vét cạn 25 khóa', 'Đọc một dòng bản mã ASCII. In 25 dòng dạng k: ứng_viên cho k từ 1 đến 25. Liệt kê ứng viên, không tự khẳng định duy nhất bản rõ đúng.',
    [{ input: 'DEF', expected: Array.from({ length: 25 }, (_, i) => `${i + 1}: ${caesar('DEF', -i - 1)}`).join('\n') }],
    program('string s;\ngetline(cin, s);\nfor (int k = 1; k <= 25; k++) {\n    string a = s;\n    ' + shift('a', '-k').replaceAll('\n', '\n    ') + '\n    cout << k << ": " << a << \'\\n\';\n}'),
    ['Thử lần lượt các khóa khác 0.', 'Đặt vòng giải mã bên trong vòng k=1…25.', 'for (int k = 1; k <= 25; k++) {\n    string a = s; // Giải mã bản sao rồi in.\n}'], { difficulty: 'professional', xp: 100 });
  add('caesar', 'final', 'Chung kết: tự viết từ đầu', 'Tự viết từ tệp trống: dòng 1 là chuỗi ASCII có thể rỗng; dòng 2 là k (−1000000…1000000) và E hoặc D. Giữ nguyên dấu cách, chữ số và dấu câu.',
    [{ input: 'Attack at dawn!\n29 E', expected: 'Dwwdfn dw gdzq!' }, { input: 'Dwwdfn dw gdzq!\n29 D', expected: 'Attack at dawn!' }, { input: 'aAzZ 09\n-1 E', expected: 'zZyY 09' }, { input: '\n0 D', expected: '' }], full,
    ['Chia thành đọc dữ liệu, chuẩn hóa khóa và xử lý ký tự.', 'Quy hai chiều về một công thức.', 'k = (k % 26 + 26) % 26;\nif (mode == "D") k = (26 - k) % 26;'], { difficulty: 'professional', xp: 150, starterCode: '', examEligible: true });

  add('affine', 'inverse', 'Tìm nghịch đảo modulo', 'Đọc a thuộc 0…25. In a⁻¹ mod26, hoặc INVALID nếu không tồn tại.',
    [{ input: '3', expected: '9' }, { input: '2', expected: 'INVALID' }], program('int a; cin >> a;\nfor (int i=1; i<26; i++) if (a*i%26==1) { cout<<i; return 0; }\ncout<<"INVALID";'),
    ['Thử các ứng viên từ 1 đến 25.', 'Tìm i sao cho a*i %26 ==1.', 'if (a * i % 26 == 1) { cout << i; return 0; }']);
  for (const decrypt of [false, true]) add('affine', decrypt ? 'decode' : 'encode', decrypt ? 'Giải mã Affine' : 'Mã hóa Affine',
    `Dòng 1: chuỗi A–Z. Dòng 2: a b thuộc 0…25. ${decrypt ? 'Giải mã' : 'Mã hóa'}; in INVALID nếu gcd(a,26)≠1.`,
    [{ input: `${decrypt ? 'INS' : 'ABC'}\n5 8`, expected: decrypt ? 'ABC' : 'INS' }, { input: 'A\n2 1', expected: 'INVALID' }],
    program('string s; getline(cin,s);\nint a,b,t=0;cin>>a>>b;\nfor(int i=1;i<26;i++)if(a*i%26==1)t=i;\nif(!t){cout<<"INVALID";return 0;}\nfor(char &c:s)c=char(\'A\'+' + (decrypt ? 't*((c-\'A\'-b+26)%26)' : '(a*(c-\'A\')+b)') + '%26);\ncout<<s;'),
    ['Kiểm tra khóa trước khi xử lý chuỗi.', decrypt ? 'P=a⁻¹(C−b) mod26.' : 'C=(aP+b) mod26.', decrypt ? "int p=t*((c-'A'-b+26)%26)%26;" : "int c=(a*p+b)%26;"], { examEligible: decrypt });
  const monoKey = 'GHJKLZXCVBNMQWERTYUIOPASDF';
  add('monoalphabetic', 'key', 'Kiểm tra khóa hoán vị', 'Đọc chuỗi khóa. In VALID nếu là hoán vị đúng 26 chữ hoa A–Z, không trùng; nếu sai in INVALID.',
    [{ input: monoKey, expected: 'VALID' }, { input: 'AAAAAAAAAAAAAAAAAAAAAAAAAA', expected: 'INVALID' }], program('string k;cin>>k;\nsort(k.begin(),k.end());\ncout<<(k=="ABCDEFGHIJKLMNOPQRSTUVWXYZ"?"VALID":"INVALID");'),
    ['Sắp xếp bản sao của khóa.', 'Chuỗi sau sắp xếp phải bằng bảng chữ cái A…Z.', 'sort(k.begin(), k.end());']);
  for (const decrypt of [false, true]) add('monoalphabetic', decrypt ? 'decode' : 'encode', decrypt ? 'Giải mã bảng thay thế' : 'Mã hóa bảng thay thế',
    `Dòng 1: chuỗi chữ hoa và dấu cách. Dòng 2: khóa hoán vị A–Z. ${decrypt ? 'Giải mã' : 'Mã hóa'}, giữ dấu cách; khóa sai in INVALID.`,
    [{ input: `${decrypt ? 'GHJ F' : 'ABC Z'}\n${monoKey}`, expected: decrypt ? 'ABC Z' : 'GHJ F' }],
    program('string s,k;getline(cin,s);cin>>k;\nstring a=k;sort(a.begin(),a.end());\nif(a!="ABCDEFGHIJKLMNOPQRSTUVWXYZ"){cout<<"INVALID";return 0;}\nfor(char &c:s)if(c>=\'A\'&&c<=\'Z\')' + (decrypt ? "c=char('A'+k.find(c));" : "c=k[c-'A'];") + '\ncout<<s;'),
    [decrypt ? 'Tìm vị trí bản mã trong khóa.' : 'Tra khóa bằng chỉ số chữ gốc.', 'A có chỉ số 0; Z có chỉ số 25.', decrypt ? "c=char('A'+k.find(c));" : "c=k[c-'A'];"], { examEligible: decrypt });
  for (const decrypt of [false, true]) add('vigenere', decrypt ? 'decode' : 'encode', decrypt ? 'Giải mã khóa lặp' : 'Mã hóa khóa lặp',
    `Đọc ${decrypt ? 'bản mã' : 'bản rõ'} và khóa, là hai chuỗi A–Z không rỗng cách nhau bởi khoảng trắng. In kết quả Vigenère.`,
    [{ input: `${decrypt ? 'YMLPPCOMTAEKOQSUMXJB' : 'WEWILLMEETATMIDNIGHT'} CIPHER`, expected: decrypt ? 'WEWILLMEETATMIDNIGHT' : 'YMLPPCOMTAEKOQSUMXJB' }],
    program('string s,k;cin>>s>>k;\nfor(int i=0;i<(int)s.size();i++){\n    int a=s[i]-\'A\',b=k[i%k.size()]-\'A\';\n    s[i]=char(\'A\'+(a' + (decrypt ? '-b+26' : '+b') + ')%26);\n}\ncout<<s;'),
    ['Quay lại đầu khóa khi hết chu kỳ.', 'Chỉ số khóa là i % k.size().', "int b = k[i % k.size()] - 'A';"], { examEligible: decrypt });
  add('vernam', 'bit', 'XOR hai bit', 'Đọc hai số a b, mỗi số là 0 hoặc 1. In a XOR b.', [{ input: '1 1', expected: '0' }, { input: '1 0', expected: '1' }],
    program('int a,b;cin>>a>>b;\ncout<<(a^b);'), ['Hai bit khác nhau cho 1.', 'Toán tử XOR là ^.', 'cout << (a ^ b);'], { difficulty: 'rookie', xp: 20 });
  add('vernam', 'bits', 'XOR chuỗi nhị phân', 'Đọc hai chuỗi nhị phân không rỗng cùng độ dài. XOR từng cặp bit và in chuỗi kết quả. Dùng lại chương trình với bản mã và cùng khóa để giải mã.',
    [{ input: '00010110 00001101', expected: '00011011' }, { input: '00011011 00001101', expected: '00010110' }],
    program('string s,k;cin>>s>>k;\nfor(int i=0;i<(int)s.size();i++)s[i]=char(\'0\'+((s[i]-\'0\')^(k[i]-\'0\')));\ncout<<s;'),
    ['Biến ký tự 0/1 thành số trước khi XOR.', 'Trừ ký tự 0, XOR, rồi cộng lại ký tự 0.', "int b=(s[i]-'0')^(k[i]-'0');"], { examEligible: true });
  add('rail-fence', 'split', 'Tách hai hàng Rail Fence', 'Đọc chuỗi A–Z không rỗng. In các vị trí chẵn trên dòng 1, lẻ trên dòng 2; chỉ số bắt đầu từ 0.',
    [{ input: 'ABCDEF', expected: 'ACE\nBDF' }], program('string s;cin>>s;\nfor(int i=0;i<(int)s.size();i+=2)cout<<s[i];\ncout<<\'\\n\';\nfor(int i=1;i<(int)s.size();i+=2)cout<<s[i];'),
    ['Mỗi hàng có bước nhảy 2.', 'Hàng đầu bắt đầu từ 0, hàng sau từ 1.', 'for(int i=0;i<(int)s.size();i+=2)cout<<s[i];']);
  add('rail-fence', 'encode', 'Ghép bản mã Rail Fence', 'Đọc chuỗi A–Z không rỗng. Mã hóa hai hàng: in hàng chẵn rồi hàng lẻ trên cùng một dòng.',
    [{ input: 'ABCDEF', expected: 'ACEBDF' }, { input: 'ABCDE', expected: 'ACEBD' }], program('string s;cin>>s;\nfor(int i=0;i<(int)s.size();i+=2)cout<<s[i];\nfor(int i=1;i<(int)s.size();i+=2)cout<<s[i];'),
    ['Ghép hai hàng theo đúng thứ tự.', 'Giữ hai vòng bước 2; bỏ ký tự xuống dòng ở giữa.', 'for(int i=1;i<(int)s.size();i+=2)cout<<s[i];'], { examEligible: true });
  add('columnar', 'grid', 'Đọc ma trận theo cột', 'Đọc đúng 9 chữ A–Z. Điền theo hàng vào ma trận 3×3; đọc theo cột. Đây là bài bổ sung thu nhỏ từ bài ma trận trong nguồn.',
    [{ input: 'ABCDEFGHI', expected: 'ADGBEHCFI' }], program('string s;cin>>s;\nfor(int j=0;j<3;j++)for(int i=0;i<3;i++)cout<<s[i*3+j];'),
    ['Vòng ngoài chọn cột.', 'Ô (i,j) có chỉ số i*3+j.', 'cout << s[i*3+j];']);
  add('columnar', 'key', 'Hoán vị thứ tự cột', 'Đọc đúng 9 chữ A–Z, rồi một hoán vị của 1 2 3. Khóa chỉ thứ tự cột cần đọc (không phải nhãn hạng). Không padding.',
    [{ input: 'ABCDEFGHI\n3 1 2', expected: 'CFIADGBEH' }], program('string s;cin>>s;\nint k[3];for(int &a:k)cin>>a;\nfor(int j=0;j<3;j++)for(int i=0;i<3;i++)cout<<s[i*3+k[j]-1];'),
    ['Đọc cột theo khóa.', 'Khóa 3 1 2 nghĩa là đọc cột 3, rồi 1, rồi 2.', 'cout << s[i*3+k[j]-1];'], { examEligible: true });
  add('hill', 'vector', 'Nhân vector Hill', 'Đọc P1 P2 thuộc 0…25. Dùng ma trận bổ sung K=[[3,3],[2,5]], vector cột. In C1 C2. Đây không phải ma trận hình nhúng trong slide.',
    [{ input: '0 1', expected: '3 5' }, { input: '7 4', expected: '7 8' }], program('int a,b;cin>>a>>b;\ncout<<(3*a+3*b)%26<<\' \'<<(2*a+5*b)%26;'),
    ['Nhân mỗi hàng của K với vector cột.', 'C1=(3P1+3P2)%26; C2=(2P1+5P2)%26.', 'cout<<(3*a+3*b)%26<<\' \'<<(2*a+5*b)%26;']);
  add('hill', 'pairs', 'Mã hóa cặp Hill', 'Đọc chuỗi A–Z có độ dài chẵn. Dùng ma trận bổ sung K=[[3,3],[2,5]], vector cột. In bản mã; không padding.',
    [{ input: 'HELP', expected: 'HIAT' }, { input: 'AB', expected: 'DF' }], program('string s;cin>>s;\nfor(int i=0;i<(int)s.size();i+=2){\n    int a=s[i]-\'A\',b=s[i+1]-\'A\';\n    cout<<char(\'A\'+(3*a+3*b)%26)<<char(\'A\'+(2*a+5*b)%26);\n}'),
    ['Mỗi vòng lấy hai ký tự gốc.', 'Tính hai đầu ra từ cùng một cặp đầu vào.', "int a=s[i]-'A',b=s[i+1]-'A';"], { examEligible: true });
  add('playfair', 'key', 'Tạo ma trận Playfair', 'Đọc khóa A–Z. Gộp J thành I, bỏ chữ trùng, thêm chữ còn lại (không J). In 25 chữ theo thứ tự hàng của ma trận 5×5.',
    [{ input: 'MONARCHY', expected: 'MONARCHYBDEFGIKLPQSTUVWXZ' }], program('string s,k="";cin>>s;\ns+="ABCDEFGHIJKLMNOPQRSTUVWXYZ";\nfor(char c:s){\n    if(c==\'J\')c=\'I\';\n    if(k.find(c)==string::npos)k+=c;\n}\ncout<<k;'),
    ['Chỉ thêm mỗi chữ một lần.', 'Gộp J thành I trước kiểm tra trùng.', "if(k.find(c)==string::npos)k+=c;"]);
  const playfair = program('string s;cin>>s;\nstring k="MONARCHYBDEFGIKLPQSTUVWXZ";\nfor(int i=0;i<(int)s.size();i+=2){\n    int a=k.find(s[i]),b=k.find(s[i+1]);\n    int r=a/5,c=a%5,u=b/5,v=b%5;\n    if(r==u){c=(c+1)%5;v=(v+1)%5;}\n    else if(c==v){r=(r+1)%5;u=(u+1)%5;}\n    else swap(c,v);\n    cout<<k[r*5+c]<<k[u*5+v];\n}');
  add('playfair', 'pair', 'Mã hóa một cặp Playfair', 'Đọc đúng hai chữ khác nhau A–Z không J. Dùng ma trận MONARCHY; in cặp mã hóa. Không cần tự tách chữ trùng.',
    [{ input: 'HS', expected: 'BP' }, { input: 'AR', expected: 'RM' }, { input: 'MU', expected: 'CM' }], playfair,
    ['Xác định hàng/cột của hai chữ.', 'Cùng hàng dịch phải; cùng cột dịch xuống; khác cả hai thì đổi cột.', 'if(r==u){c=(c+1)%5;v=(v+1)%5;}']);
  add('playfair', 'pairs', 'Mã hóa chuỗi đã tách cặp', 'Đọc chuỗi A–Z không J có độ dài chẵn. Mỗi cặp gồm hai chữ khác nhau, đã được chuẩn hóa sẵn. Dùng MONARCHY. Bài này chưa yêu cầu tự chuẩn hóa BALLOON.',
    [{ input: 'BALXLOON', expected: 'IBSUPMNA' }], playfair,
    ['Lặp quy tắc một cặp theo bước 2.', 'Không đổi cách tách cặp được cung cấp.', 'for(int i=0;i<(int)s.size();i+=2){ /* xử lý cặp */ }'], { examEligible: true });
  add('feistel', 'round', 'Một vòng Feistel đồ chơi', 'Đọc L R K thuộc 0…255. Quy ước bổ sung F(R,K)=(R+K) mod256. In L_mới R_mới với L_mới=R, R_mới=L XOR F(R,K). Không hoán đổi cuối khối.',
    [{ input: '1 2 3', expected: '2 4' }], program('int l,r,k;cin>>l>>r>>k;\ncout<<r<<\' \'<<(l^((r+k)%256));'),
    ['Giữ hai nửa cũ trước khi cập nhật.', 'L′=R; R′=L XOR F(R,K).', 'int b=l^((r+k)%256);']);
  add('feistel', 'two', 'Hai vòng Feistel', 'Đọc L R K thuộc 0…255. Thực hiện i=1,2 với Ki=(K<<i) mod256, F=(R+Ki) mod256. In L2 R2, không hoán đổi cuối. Quy ước cắt 8 bit được bổ sung để tránh mơ hồ.',
    [{ input: '1 2 3', expected: '9 23' }], program('int l,r,k;cin>>l>>r>>k;\nfor(int i=1;i<=2;i++){\n    int key=(k<<i)%256;\n    int a=r,b=l^((r+key)%256);\n    l=a;r=b;\n}\ncout<<l<<\' \'<<r;'),
    ['Lặp hai vòng với khóa con theo i.', 'Cắt tổng và khóa con về 8 bit.', 'int a=r,b=l^((r+key)%256);\nl=a;r=b;'], { examEligible: true });
  return cards;
}
