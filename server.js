const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const dataFile = path.join(__dirname, 'posts.json');
const usersFile = path.join(__dirname, 'users.json');

function loadData(file) {
    if (fs.existsSync(file)) {
        try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return []; }
    }
    return [];
}

function saveData(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

let tankPlayers = {};
let bullets = [];

// 탱크 게임 루프 (총알 이동 및 피격 판정)
setInterval(() => {
    // 총알 이동
    bullets.forEach(b => {
        b.x += Math.cos(b.angle) * 7;
        b.y += Math.sin(b.angle) * 7;
    });

    // 화면 밖으로 나간 총알 제거
    bullets = bullets.filter(b => b.x >= 0 && b.x <= 680 && b.y >= 0 && b.y <= 400);

    // 피격 판정
    let users = loadData(usersFile);
    bullets.forEach((b, bIdx) => {
        Object.entries(tankPlayers).forEach(([socketId, p]) => {
            if (p.username !== b.owner && Math.hypot(p.x - b.x, p.y - b.y) < 20) {
                // 적 탱크 맞힘! 총알 제거 및 발사자 포인트 지급
                bullets.splice(bIdx, 1);
                let shooter = users.find(u => u.username === b.owner);
                if (shooter) {
                    shooter.points = (shooter.points || 0) + 30;
                    saveData(usersFile, users);
                    io.emit('update_users', users);
                }
            }
        });
    });

    io.emit('tank_game_state', { players: tankPlayers, bullets });
}, 1000 / 60);

io.on('connection', (socket) => {
    socket.emit('update_posts', loadData(dataFile));
    socket.emit('update_users', loadData(usersFile));

    socket.on('join_tank_game', (data) => {
        tankPlayers[socket.id] = { username: data.username, x: data.x, y: data.y, angle: 0 };
    });

    socket.on('tank_move', (pos) => {
        if (tankPlayers[socket.id]) {
            tankPlayers[socket.id].x = pos.x;
            tankPlayers[socket.id].y = pos.y;
            tankPlayers[socket.id].angle = pos.angle;
        }
    });

    socket.on('tank_shoot', (data) => {
        if (tankPlayers[socket.id]) {
            bullets.push({ owner: tankPlayers[socket.id].username, x: data.x, y: data.y, angle: data.angle });
        }
    });

    socket.on('leave_tank_game', () => {
        delete tankPlayers[socket.id];
    });

    socket.on('disconnect', () => {
        delete tankPlayers[socket.id];
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, message: '닉네임과 비밀번호를 입력해주세요.' });

    let users = loadData(usersFile);
    let user = users.find(u => u.username === username);

    if (user) {
        if (user.password !== password) return res.json({ success: false, message: '비밀번호가 틀렸습니다.' });
    } else {
        user = { username, password, avatar: 'https://via.placeholder.com/150', points: 0, frame: 'border-cyan-400' };
        users.push(user);
        saveData(usersFile, users);
        io.emit('update_users', users);
    }
    res.json({ success: true, user });
});

app.post('/api/profile', upload.single('avatar'), (req, res) => {
    const { username } = req.body;
    let users = loadData(usersFile);
    let user = users.find(u => u.username === username);
    if (!user) return res.json({ success: false });

    user.avatar = `/uploads/${req.file.filename}`;
    saveData(usersFile, users);
    io.emit('update_users', users);
    res.json({ success: true, avatar: user.avatar });
});

app.post('/api/frame', (req, res) => {
    const { username, frame, cost } = req.body;
    let users = loadData(usersFile);
    let user = users.find(u => u.username === username);
    if (!user) return res.json({ success: false });

    if ((user.points || 0) < cost) return res.json({ success: false, message: '포인트가 부족합니다!' });

    user.points -= cost;
    user.frame = frame;
    saveData(usersFile, users);
    io.emit('update_users', users);
    res.json({ success: true, points: user.points, frame: user.frame });
});

app.get('/api/users', (req, res) => res.json(loadData(usersFile)));
app.get('/api/posts', (req, res) => res.json(loadData(dataFile)));

app.post('/api/posts', upload.single('image'), (req, res) => {
    const { author, title, desc } = req.body;
    const posts = loadData(dataFile);
    posts.unshift({
        id: Date.now(),
        author,
        title,
        desc: desc || '',
        image: req.file ? `/uploads/${req.file.filename}` : null,
        date: new Date().toLocaleDateString(),
        comments: []
    });
    saveData(dataFile, posts);
    io.emit('update_posts', posts);
    res.json({ success: true });
});

app.delete('/api/posts/:id', (req, res) => {
    let posts = loadData(dataFile).filter(p => p.id !== Number(req.params.id));
    saveData(dataFile, posts);
    io.emit('update_posts', posts);
    res.json({ success: true });
});

app.post('/api/posts/:id/comments', (req, res) => {
    let posts = loadData(dataFile);
    let post = posts.find(p => p.id === Number(req.params.id));
    if (post) {
        if (!post.comments) post.comments = [];
        post.comments.push({ id: Date.now(), author: req.body.author, text: req.body.text, date: new Date().toLocaleDateString() });
        saveData(dataFile, posts);
        io.emit('update_posts', posts);
    }
    res.json({ success: true });
});

app.delete('/api/posts/:postId/comments/:commentId', (req, res) => {
    let posts = loadData(dataFile);
    let post = posts.find(p => p.id === Number(req.params.postId));
    if (post) {
        post.comments = post.comments.filter(c => c.id !== Number(req.params.commentId));
        saveData(dataFile, posts);
        io.emit('update_posts', posts);
    }
    res.json({ success: true });
});

app.delete('/api/users/:username', (req, res) => {
    const target = decodeURIComponent(req.params.username);
    let users = loadData(usersFile).filter(u => u.username !== target);
    saveData(usersFile, users);
    io.emit('update_users', users);

    let posts = loadData(dataFile).filter(p => p.author !== target);
    posts.forEach(p => { if (p.comments) p.comments = p.comments.filter(c => c.author !== target); });
    saveData(dataFile, posts);
    io.emit('update_posts', posts);
    io.emit('force_logout', target);
    res.json({ success: true });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
