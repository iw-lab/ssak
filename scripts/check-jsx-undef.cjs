// JSX 대문자 태그가 import·선언 안 된 채 쓰이는지(빌드는 통과하고 화면에서 터지는 오류) 잡는다
const fs = require("fs"); const parser = require("@babel/parser");
let bad = 0;
for (const f of process.argv.slice(2)) {
  const src = fs.readFileSync(f, "utf8"); const ast = parser.parse(src, { sourceType: "module", plugins: ["jsx"] });
  const declared = new Set(); const used = new Map();
  const walk = (n) => { if (!n || typeof n.type !== "string") return;
    if (n.type === "ImportSpecifier" || n.type === "ImportDefaultSpecifier" || n.type === "ImportNamespaceSpecifier") declared.add(n.local.name);
    if ((n.type === "VariableDeclarator" || n.type === "FunctionDeclaration" || n.type === "ClassDeclaration") && n.id) { if (n.id.type === "Identifier") declared.add(n.id.name); else if (n.id.type === "ObjectPattern") n.id.properties.forEach((p) => p.value && p.value.name && declared.add(p.value.name)); }
    if (n.type === "JSXOpeningElement" && n.name.type === "JSXIdentifier" && /^[A-Z]/.test(n.name.name)) used.set(n.name.name, n.loc.start.line);
    // JSX 글자 속 «// 주석»·«design-gate» 표시 = 화면에 그대로 찍힌다(2026-11-18 «학생별 백업 // design-gate: emoji-ok…» 버튼)
    if (n.type === "JSXText" && /design-gate|\/\/ /.test(n.value)) { bad++; console.log(`${f}:${n.loc.start.line} JSX 글자에 주석이 섞임 «${n.value.trim().slice(0, 50)}»`); }
    // 폼에 noValidate = 브라우저 빈 칸 검사가 꺼져 빈 로그인이 서버까지 간다(2026-11-18 리디자인 재작성 중 끼어듦)
    if (n.type === "JSXAttribute" && n.name && n.name.name === "noValidate") { bad++; console.log(`${f}:${n.loc.start.line} <form noValidate> — 브라우저 필수 칸 검사가 꺼진다`); }
    for (const k of Object.keys(n)) { if (k === "loc") continue; const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === "string") walk(v); }
    // 함수 매개변수의 구조분해({ Icon })·map 콜백 등
    if ((n.type === "ArrowFunctionExpression" || n.type === "FunctionExpression" || n.type === "FunctionDeclaration") ) for (const p of n.params) { if (p.type === "Identifier") declared.add(p.name); if (p.type === "ObjectPattern") p.properties.forEach((q) => q.value && q.value.type === "Identifier" && declared.add(q.value.name)); }
  };
  walk(ast.program);
  for (const [name, line] of used) if (!declared.has(name)) { bad++; console.log(`${f}:${line} <${name}> 선언 없음`); }
}
console.log(bad ? `FAIL ${bad}` : "PASS"); process.exit(bad ? 1 : 0);
