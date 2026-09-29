const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const dataFile = path.join(__dirname, 'posts.json');
const usersFile = path.join(__dirname, 'users.json');

function loadData(file) {
    if (fs.existsSync(file)) {
        try {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch (e) { return []; }
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

// 1. 로그인 / 회원가입 API (비밀번호 검증)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.json({ success: false, message: '이름과 비밀번호를 입력해주세요.' });
    }
    const users = loadData(usersFile);
    let user = users.find(u => u.username === username);

    if (user) {
        if (user.password !== password) {
            return res.json({ success: false, message: '비밀번호가 틀렸습니다.' });
        }
    } else {
        users.push({ username, password });
        saveData(usersFile, users);
    }
    res.json({ success: true, username });
});

// 2. 게시글 목록 조회
app.get('/api/posts', (req, res) => {
    res.json(loadData(dataFile));
});

// 3. 게시글 작성
app.post('/api/posts', upload.single('image'), (req, res) => {
    const { author, title, desc } = req.body;
    if (!author || !title) {
        return res.status(400).json({ success: false, message: '필수 항목이 누락되었습니다.' });
    }

    const posts = loadData(dataFile);
    const newPost = {
        id: Date.now(),
        author,
        title,
        desc: desc || '',
        image: req.file ? `/uploads/${req.file.filename}` : null,
        date: new Date().toLocaleDateString(),
        comments: []
    };

    posts.unshift(newPost);
    saveData(dataFile, posts);
    res.json({ success: true, post: newPost });
});

// 4. 게시글 삭제 (본인 혹은 '이윤호' 계정이면 삭제 가능)
app.delete('/api/posts/:id', (req, res) => {
    const postId = Number(req.params.id);
    const { username } = req.body;

    let posts = loadData(dataFile);
    const post = posts.find(p => p.id === postId);

    if (!post) return res.json({ success: false, message: '게시글이 없습니다.' });

    if (username !== post.author && username !== '이윤호') {
        return res.json({ success: false, message: '삭제 권한이 없습니다.' });
    }

    posts = posts.filter(p => p.id !== postId);
    saveData(dataFile, posts);
    res.json({ success: true });
});

// 5. 댓글 작성 API
app.post('/api/posts/:id/comments', (req, res) => {
    const postId = Number(req.params.id);
    const { author, text } = req.body;

    if (!author || !text) return res.json({ success: false, message: '내용을 입력해주세요.' });

    let posts = loadData(dataFile);
    const post = posts.find(p => p.id === postId);

    if (!post) return res.json({ success: false, message: '게시글이 없습니다.' });

    if (!post.comments) post.comments = [];
    post.comments.push({
        author,
        text,
        date: new Date().toLocaleDateString()
    });

    saveData(dataFile, posts);
    res.json({ success: true });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
