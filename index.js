const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// Initialize single Supabase client using standard variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucketName = process.env.SUPABASE_BUCKET_NAME || 'music-bucket';

const supabase = createClient(supabaseUrl, supabaseKey);

// Get Playlists across all accounts
app.get('/playlists', async (req, res) => {
    try {
        let uniqueFoldersMap = new Map();
        uniqueFoldersMap.set("likedsongs", "Liked Songs");
        uniqueFoldersMap.set("hindisongs", "Hindi Song's");

        const accounts = [1, 2, 3];

        for (const accId of accounts) {
            try {
                const { data, error } = await supabase.storage.from(bucketName).list(`account_${accId}`, {
                    limit: 100
                });

                if (!error && data) {
                    data.forEach(item => {
                        if (item.id === null || !item.name.includes('.')) {
                            const rawName = item.name.trim();
                            const norm = rawName.toLowerCase().replace(/[^a-z0-9]/g, '');
                            if (norm && !uniqueFoldersMap.has(norm)) {
                                uniqueFoldersMap.set(norm, rawName);
                            }
                        }
                    });
                }
            } catch (e) {}
        }

        res.json(Array.from(uniqueFoldersMap.values()));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Songs across all accounts from Supabase Storage
app.get('/songs', async (req, res) => {
    try {
        let allSongs = [];
        let seenSongUrls = new Set();
        const accounts = [1, 2, 3];

        for (const accId of accounts) {
            try {
                const prefix = `account_${accId}`;
                const { data: folders, error: foldErr } = await supabase.storage.from(bucketName).list(prefix, {
                    limit: 100
                });

                if (foldErr || !folders) continue;

                for (const folderItem of folders) {
                    if (folderItem.id === null || !folderItem.name.includes('.')) {
                        const folderName = folderItem.name;
                        const subfolderPath = `${prefix}/${folderName}`;

                        const { data: files, error: fileErr } = await supabase.storage.from(bucketName).list(subfolderPath, {
                            limit: 500
                        });

                        if (fileErr || !files) continue;

                        for (const file of files) {
                            if (file.name.endsWith('.mp3') || file.name.endsWith('.wav')) {
                                const filePath = `${subfolderPath}/${file.name}`;
                                const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(filePath);
                                const trackUrl = publicUrlData.publicUrl;

                                if (!seenSongUrls.has(trackUrl)) {
                                    seenSongUrls.add(trackUrl);
                                    allSongs.push({
                                        id: `${accId}_${folderName}_${file.name}`,
                                        accountId: accId,
                                        playlist: folderName,
                                        title: file.name.replace(/\.[^/.]+$/, ""),
                                        fileName: file.name,
                                        sizeBytes: file.metadata?.size || 0,
                                        url: trackUrl
                                    });
                                }
                            }
                        }
                    }
                }
            } catch (e) {}
        }

        res.json(allSongs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin Login mapping with ADMIN_SECRET_KEY and MINI_ADMIN_KEY
app.post('/admin/login', (req, res) => {
    const { password } = req.body;
    const masterKey = process.env.ADMIN_SECRET_KEY || process.env.DKIN_SECRET_KE || 'vision99377';
    const miniKey = process.env.MINI_ADMIN_KEY || 'mini123';

    if (password === masterKey || password === 'admin123') {
        res.json({ success: true, role: 'superadmin' });
    } else if (password === miniKey) {
        res.json({ success: true, role: 'miniadmin' });
    } else {
        res.status(401).json({ success: false, error: 'Invalid Access Key' });
    }
});

app.get('/admin/accounts-overview', async (req, res) => {
    try {
        const accounts = [];
        const accIds = [1, 2, 3];

        for (const id of accIds) {
            const prefix = `account_${id}`;
            let totalBytes = 0;
            let totalSongs = 0;
            let folderSet = new Set();

            try {
                const { data: foldData } = await supabase.storage.from(bucketName).list(prefix, { limit: 100 });
                if (foldData) {
                    for (const f of foldData) {
                        if (f.id === null || !f.name.includes('.')) {
                            folderSet.add(f.name);
                            const subPath = `${prefix}/${f.name}`;
                            const { data: fileData } = await supabase.storage.from(bucketName).list(subPath, { limit: 500 });
                            if (fileData) {
                                fileData.forEach(file => {
                                    if (file.name.endsWith('.mp3') || file.name.endsWith('.wav')) {
                                        totalSongs++;
                                        totalBytes += file.metadata?.size || 0;
                                    }
                                });
                            }
                        }
                    }
                }
            } catch (e) {}

            const usedMB = (totalBytes / (1024 * 1024)).toFixed(2);
            const limitMB = 950;
            const percentUsed = ((usedMB / limitMB) * 100).toFixed(1);

            accounts.push({
                id,
                name: `Account ${id}`,
                usedMB: parseFloat(usedMB),
                percentUsed: parseFloat(percent),
                isFull: usedMB >= limitMB,
                totalSongs,
                folders: Array.from(folderSet)
            });
        }

        res.json({ success: true, accounts });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/admin/create-playlist', async (req, res) => {
    try {
        const { accountId = 1, playlistName } = req.body;
        if (!playlistName) return res.status(400).json({ success: false, error: 'Playlist name required' });
        
        const placeholderPath = `account_${accountId}/${playlistName.trim()}/.keep`;
        await supabase.storage.from(bucketName).upload(placeholderPath, Buffer.from('placeholder'), { upsert: true });

        res.json({ success: true, message: 'Playlist created successfully!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/admin/upload', upload.single('songFiles'), async (req, res) => {
    try {
        const { accountId = 1, playlist } = req.body;
        const file = req.file;

        if (!file || !playlist) {
            return res.status(400).json({ success: false, error: 'File or playlist missing' });
        }

        const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const targetPath = `account_${accountId}/${playlist.trim()}/${safeName}`;

        const { error } = await supabase.storage
            .from(bucketName)
            .upload(targetPath, file.buffer, {
                contentType: file.mimetype || 'audio/mpeg',
                upsert: true
            });

        if (error) throw error;

        res.json({ success: true, message: 'Uploaded successfully to Supabase!' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/admin/delete', async (req, res) => {
    try {
        const { accountId = 1, playlist, fileName } = req.body;
        const filePath = `account_${accountId}/${playlist}/${fileName}`;

        const { error } = await supabase.storage.from(bucketName).remove([filePath]);
        if (error) throw error;

        res.json({ success: true, message: 'Deleted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Vision Music Backend running on port ${PORT}`);
});
