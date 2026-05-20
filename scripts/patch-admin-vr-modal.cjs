const fs = require('fs')
const p = require('path').join(__dirname, '..', 'src', 'pages', 'Admin.js')
let s = fs.readFileSync(p, 'utf8')
// Fix double/broken h3 open
s = s.replace(/<[\s\S]{0,3}<h3>Tu choi bao khong xem duoc<\/h3>/m, '<h3>Tu choi bao khong xem duoc</h3>')
// Placeholder line
const plRe = /placeholder="[^"]*Premium[^"]*"/
if (plRe.test(s)) s = s.replace(plRe, 'placeholder="Vi du: Da kiem tra tai khoan con Premium…"')
// Hu� / Gửi buttons (any mojibake between chars)
s = s.replace(/vr-reject-close">Hu[^<]*</g, 'vr-reject-close">Huy<')
s = s.replace(/id="vrRejectSubmit">[^<]+</g, 'id="vrRejectSubmit">Gui tu choi<')
fs.writeFileSync(p, s)
console.log('patched')
