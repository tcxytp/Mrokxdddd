const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

const STORAGE_DIR = path.join(__dirname, 'storage');
if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR);

function getAccountDir(accountId = 1) {
    const accDir = path.join(STORAGE_DIR, `account_${accountId}`);
    if (!fs.existsSync(accDir)) fs.mkdirSync(accDir, { recursive: true });
    return accDir;
}

const upload = multer({ storage: multer.memoryStorage() });

app.get('/playlists', (req, res) => {
    try {
        const accounts = [1, 2, 3];
        let allFolders = new Set(["Liked Songs", "Hindi Song's"]);
        
        accounts.forEach(accId => {
            const accDir = getAccountDir(accId);
            if (fs.existsSync(accDir)) {
                const folders = fs.readdirSync(accDir, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);
                folders.forEach(f => allFolders.add(f));
            }
        });

        res.json(Array.from(allFolders));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/songs', (req, res) => {
    try {
        let allSongs = [];
        const accounts = [1, 2, 3];

        accounts.forEach(accId => {
            const accDir = getAccountDir(accId);
            if (!fs.existsSync(accDir)) return;

            const folders = fs.readdirSync(accDir, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);

            folders.forEach(folder => {
                const folderPath = path.join(accDir, folder);
                const files = fs.readdirSync(folderPath);

                files.forEach(file => {
                    if (file.endsWith('.mp3') || file.endsWith('.wav')) {
                        const filePath = path.join(folderPath, file);
                        const stats = fs.statSync(filePath);
                        allSongs.push({
                            id: `${accId}_${folder}_${file}`,
                            accountId: accId,
                            playlist: folder,
                            title: file.replace(/\.[^/.]+$/, ""),
                            fileName: file,
                            sizeBytes: stats.size,
                            url: `https://${req.get('host')}/stream/${accId}/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`
                        });
                    }
                });
            });
        });

        res.json(allSongs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/stream/:accId/:playlist/:filename', (req, res) => {
    try {
        const { accId, playlist, filename } = req.params;
        const filePath = path.join(getAccountDir(accId), playlist, filename);
        if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
        } else {
            res.status(404).send('Track not found');
        }
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.post('/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === 'vision99377' || password === 'admin123') {
        res.json({ success: true, role: 'superadmin' });
    } else if (password === 'mini123') {
        res.json({ success: true, role: 'miniadmin' });
    } else {
        res.status(401).json({ success: false, error: 'Invalid Access Key' });
    }
});

app.get('/admin/accounts-overview', (req, res) => {
    try {
        const accounts = [1, 2, 3].map(id => {
            const accDir = getAccountDir(id);
            let totalBytes = 0;
            let totalSongs = 0;
            let folders = [];

            if (fs.existsSync(accDir)) {
                folders = fs.readdirSync(accDir, { withFileTypes: true })
                    .filter(d => d.isDirectory())
                    .map(d => d.name);

                folders.forEach(folder => {
                    const fPath = path.join(accDir, folder);
                    const files = fs.readdirSync(fPath);
                    files.forEach(file => {
                        if (file.endsWith('.mp3') || file.endsWith('.wav')) {
                            totalSongs++;
                            totalBytes += fs.statSync(path.join(fPath, file)).size;
                        }
                    });
                });
            }

            const usedMB = (totalBytes / (1024 * 1024)).toFixed(2);
            const limitMB = 950;
            const percentUsed = ((usedMB / limitMB) * 100).toFixed(1);

            return {
                id,
                name: `Account ${id}`,
                usedMB: parseFloat(usedMB),
                percentUsed: parseFloat(percent),
                isFull: usedMB >= limitMB,
                totalSongs,
                folders
            };
        });

        res.json({ success: true, accounts });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/admin/create-playlist', (req, res) => {
    try {
        const { accountId = 1, playlistName } = req.body;
        if (!playlistName) return res.status(400).json({ success: false, error: 'Playlist name required' });
        const folderPath = path.join(getAccountDir(accountId), playlistName.trim());
        if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
        res.json({ success: true, message: 'Playlist created successfully!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/admin/upload', upload.single('songFiles'), (req, res) => {
    try {
        const { accountId = 1, playlist } = req.body;
        const file = req.file;

        if (!file || !playlist) {
            return res.status(400).json({ success: false, error: 'File or playlist missing' });
        }

        const folderPath = path.join(getAccountDir(accountId), playlist.trim());
        if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

        const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const destPath = path.join(folderPath, safeName);

        fs.writeFileSync(destPath, file.buffer);
        res.json({ success: true, message: 'Uploaded successfully!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/admin/delete', (req, res) => {
    try {
        const { accountId = 1, playlist, fileName } = req.body;
        const filePath = path.join(getAccountDir(accountId), playlist, fileName);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            res.json({ success: true, message: 'Deleted successfully' });
        } else {
            res.status(404).json({ success: false, error: 'File not found' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Vision Music Backend running on port ${PORT}`);
});
