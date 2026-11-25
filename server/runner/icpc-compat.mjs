// Explicit ICPC include compatibility over libc++, NOT GNU libstdc++.
// Lives only in the compiler VFS. Learner source is passed byte-for-byte unchanged.
export const icpcHeader = '#pragma once\n' + [
  'algorithm','array','bitset','cassert','cctype','cerrno','cfloat','climits',
  'cmath','complex','cstddef','cstdint','cstdio','cstdlib','cstring','deque',
  'functional','iomanip','ios','iostream','istream','iterator','limits','list',
  'map','memory','numeric','ostream','queue','random','set','sstream','stack',
  'string','tuple','type_traits','unordered_map','unordered_set','utility',
  'valarray','vector'
].map(name => `#include <${name}>\n`).join('');
export const compilerLabel = 'Clang 22.1.6 · GNU++17 syntax · libc++ 220106/WASI · ICPC header compatibility (not GNU G++)';
