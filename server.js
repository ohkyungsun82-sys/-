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
        try { 
            const data = fs.readFileSync(file, 'utf8');
            return data ? JSON.parse(data) : []; 
        } catch (e) { 
            console.error(`Error reading ${file}:`, e);
            return []; 
        }
    }
    return [];
}

function saveData(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error(`Error saving ${file}:`, e);
    }
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

io.on('connection', (socket) => {
    socket.emit('update_posts', loadData(dataFile));
    socket.emit('update_users', loadData(usersFile));
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, message: '닉네임과 비밀번호를 입력해주세요.' });

    let users = loadData(usersFile);
    let user = users.find(u => u.username === username);

    if (user) {
        if (user.password !== password) return res.json({ success: false, message: '이미 존재하는 닉네임이며 비밀번호가 틀렸습니다.' });
    } else {
        user = { username, password, avatar: 'https://via.placeholder.com/150' };
        users.push(user);
        saveData(usersFile, users);
        io.emit('update_users', users);
    }
    res.json({ success: true, user });
});

app.post('/api/profile', upload.single('avatar'), (req, res) => {
    const { username } = req.body;
    if (!username || !req.file) return res.json({ success: false, message: '잘못된 요청입니다.' });

    let users = loadData(usersFile);
    let user = users.find(u => u.username === username);
    if (!user) return res.json({ success: false, message: '유저를 찾을 수 없습니다.' });

    user.avatar = `/uploads/${req.file.filename}`;
    saveData(usersFile, users);
    io.emit('update_users', users);
    res.json({ success: true, avatar: user.avatar });
});

app.get('/api/users', (req, res) => {
    res.json(loadData(usersFile));
});

app.get('/api/posts', (req, res) => {
    res.json(loadData(dataFile));
});

/* 게시글 작성 (최신 데이터 로드 후 병합 저장) */
app.post('/api/posts', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'model', maxCount: 1 }]), (req, res) => {
    const { author, title, desc } = req.body;
    if (!author || !title) return res.json({ success: false, message: '필수 항목이 누락되었습니다.' });

    const posts = loadData(dataFile);
    const newPost = {
        id: Date.now(),
        author,
        title,
        desc: desc || '',
        image: req.files && req.files['image'] ? `/uploads/${req.files['image'][0].filename}` : null,
        model: req.files && req.files['model'] ? `/uploads/${req.files['model'][0].filename}` : null,
        date: new Date().toLocaleDateString(),
        likes: [],
        comments: []
    };

    posts.unshift(newPost);
    saveData(dataFile, posts);
    io.emit('update_posts', posts);
    res.json({ success: true });
});

app.delete('/api/posts/:id', (req, res) => {
    const postId = Number(req.params.id);
    const { username } = req.body;

    let posts = loadData(dataFile);
    const post = posts.find(p => p.id === postId);
    if (!post) return res.json({ success: false, message: '게시글이 없습니다.' });

    if (username !== post.author && username !== '이윤호') return res.json({ success: false });

    posts = posts.filter(p => p.id !== postId);
    saveData(dataFile, posts);
    io.emit('update_posts', posts);
    res.json({ success: true });
});

/* 작품 좋아요 토글 (안전한 배열 조작) */
app.post('/api/posts/:id/like', (req, res) => {
    const postId = Number(req.params.id);
    const { username } = req.body;
    if (!username) return res.json({ success: false, message: '로그인이 필요합니다.' });

    let posts = loadData(dataFile);
    const post = posts.find(p => p.id === postId);
    if (!post) return res.json({ success: false, message: '게시글이 없습니다.' });

    if (!Array.isArray(post.likes)) post.likes = [];
    
    const index = post.likes.indexOf(username);
    if (index > -1) {
        post.likes.splice(index, 1); // 취소
    } else {
        post.likes.push(username); // 추가
    }

    saveData(dataFile, posts);
    io.emit('update_posts', posts);
    res.json({ success: true });
});

app.post('/api/posts/:id/comments', (req, res) => {
    const postId = Number(req.params.id);
    const { author, text } = req.body;

    if (!author || !text) return res.json({ success: false, message: '내용을 입력해주세요.' });

    let users = loadData(usersFile);
    let user = users.find(u => u.username === author);
    let avatar = user ? user.avatar : 'https://via.placeholder.com/150';

    let posts = loadData(dataFile);
    const post = posts.find(p => p.id === postId);
    if (!post) return res.json({ success: false, message: '게시글이 없습니다.' });

    if (!Array.isArray(post.comments)) post.comments = [];
    post.comments.push({
        id: Date.now(),
        author,
        avatar,
        text,
        likes: [],
        date: new Date().toLocaleDateString()
    });

    saveData(dataFile, posts);
    io.emit('update_posts', posts);
    res.json({ success: true });
});

app.delete('/api/posts/:postId/comments/:commentId', (req, res) => {
    const postId = Number(req.params.postId);
    const commentId = Number(req.params.commentId);
    const { username } = req.body;

    let posts = loadData(dataFile);
    const post = posts.find(p => p.id === postId);
    if (!post) return res.json({ success: false });

    const comment = post.comments.find(c => c.id === commentId);
    if (!comment) return res.json({ success: false });

    if (username !== comment.author && username !== '이윤호') return res.json({ success: false });

    post.comments = post.comments.filter(c => c.id !== commentId);
    saveData(dataFile, posts);
    io.emit('update_posts', posts);
    res.json({ success: true });
});

/* 댓글 좋아요 토글 (안전한 배열 조작) */
app.post('/api/posts/:postId/comments/:commentId/like', (req, res) => {
    const postId = Number(req.params.postId);
    const commentId = Number(req.params.commentId);
    const { username } = req.body;
    if (!username) return res.json({ success: false });

    let posts = loadData(dataFile);
    const post = posts.find(p => p.id === postId);
    if (!post) return res.json({ success: false });

    const comment = post.comments.find(c => c.id === commentId);
    if (!comment) return res.json({ success: false });

    if (!Array.isArray(comment.likes)) comment.likes = [];
    
    const index = comment.likes.indexOf(username);
    if (index > -1) {
        comment.likes.splice(index, 1);
    } else {
        comment.likes.push(username);
    }

    saveData(dataFile, posts);
    io.emit('update_posts', posts);
    res.json({ success: true });
});

app.delete('/api/users/:username', (req, res) => {
    const targetUsername = decodeURIComponent(req.params.username);
    const { admin } = req.body;

    if (admin !== '이윤호') return res.json({ success: false });

    let users = loadData(usersFile);
    users = users.filter(u => u.username !== targetUsername);
    saveData(usersFile, users);
    io.emit('update_users', users);

    let posts = loadData(dataFile);
    posts = posts.filter(p => p.author !== targetUsername);
    posts.forEach(p => {
        if (p.comments) {
            p.comments = p.comments.filter(c => c.author !== targetUsername);
        }
    });
    saveData(dataFile, posts);
    io.emit('update_posts', posts);

    io.emit('force_logout', targetUsername);

    res.json({ success: true });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
