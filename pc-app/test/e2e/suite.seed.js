// Before launch: config (folder, organize, backup) and old backup generations. Seeded 2021-2023 are listed as
// written by the app (backupWritten); 2020 is a hand-made backup with the same name pattern.
fs.mkdirSync(UD, { recursive: true });
const BK0 = path.join(UD, '..', path.basename(UD) + '-bk');
fs.rmSync(BK0, { recursive: true, force: true }); fs.mkdirSync(BK0, { recursive: true });
['TacticalArchive_Full_20200101_000000.json', 'TacticalArchive_Full_20210101_000000.json', 'TacticalArchive_Full_20220101_000000.json', 'TacticalArchive_Full_20230101_000000.json', 'other.json', 'TacticalArchive_Full_memo.json']
    .forEach(n => fs.writeFileSync(path.join(BK0, n), '{}'));
fs.writeFileSync(path.join(UD, 'config.json'), JSON.stringify({ folder: IMG, organizeEnabled: true, organizeRename: true, backupFolder: BK0, backupOnStartup: true, backupKeep: 3, backupWrittenFolder: BK0, backupWritten: ['TacticalArchive_Full_20210101_000000.json', 'TacticalArchive_Full_20220101_000000.json', 'TacticalArchive_Full_20230101_000000.json'] }));
