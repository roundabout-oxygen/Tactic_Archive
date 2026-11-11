// Before launch: an organize folder with two images and an existing file that has their target name
const ORG = path.join(SCRATCH, 'org-' + Date.now());
fs.mkdirSync(path.join(ORG, '取り込み済み'), { recursive: true });
fs.writeFileSync(path.join(ORG, 'a.png'), Buffer.alloc(1111, 1));
fs.writeFileSync(path.join(ORG, 'b.png'), Buffer.alloc(2222, 2));
fs.writeFileSync(path.join(ORG, '取り込み済み', '2026-11-05_同名テスト_WIN_攻撃.png'), Buffer.alloc(3333, 3));
{
    fs.mkdirSync(UD, { recursive: true });
    const cfgPath = path.join(UD, 'config.json');
    let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch (e) {}
    Object.assign(cfg, { folder: ORG, organizeEnabled: true, organizeRename: true, organizeSubfolder: '取り込み済み', backupFolder: '' });
    fs.writeFileSync(cfgPath, JSON.stringify(cfg));
}
