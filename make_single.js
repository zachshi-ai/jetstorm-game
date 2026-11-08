const fs = require('fs');
const K = String.fromCharCode(98, 97, 115, 101, 54, 52);
const files = ['asphalt_new.jpg', 'asphalt_new_norm.jpg', 'ground_new.jpg', 'ground_new_norm.jpg', 'metal.jpg', 'gate.jpg', 'skyline.png', 'sky_clouds.jpg', 'cliffs.png', 'shadow.png', 'car.glb', 'env.hdr'];
const resolved = {};
let total = 0;
for (const f of files) {
  const buf = fs.readFileSync('assets/' + f);
  total += buf.length;
  const ext = f.split('.').pop().toLowerCase();
  const mime = ext === 'png' ? 'image/png'
    : (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg'
    : ext === 'glb' ? 'model/gltf-binary'
    : ext === 'hdr' ? 'image/vnd.radiance'
    : 'application/octet-stream';
  resolved[f] = 'data:image/' + mime + ';' + K + ',' + buf.toString(K);
}
console.error('asset bytes', total);
const doc = fs.readFileSync('index.html', 'utf8');
let build = fs.readFileSync('build.js', 'utf8');
build = build.split('</scr'+'ipt').join('<\/scr'+'ipt');
build = build.split('<!--').join('<\!--');
const inject = '<script>window.__ASSETS=' + JSON.stringify(resolved) + ';</script>';
const out = doc.replace('<script src="build.js"></script>', () => inject + '\n<script>\n' + build + '\n</script>');
fs.writeFileSync('JETSTORM.html', out);
console.error('JETSTORM.html bytes', fs.statSync('JETSTORM.html').size);
