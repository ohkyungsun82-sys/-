// server.js (Node.js + Express 기반 백엔드 서버)
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// 업로드된 파일이 저장될 폴더 생성
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// 메모리 기반 데이터 저장소 (실제 서비스에서는 DB 사용 권장)
let users = [];
let posts = [];

// 미들웨어 설정
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // 프론트엔드 파일 제공용
app.use('/uploads', express.static(uploadDir)); // 업로드된 이미지 접근용

// 파일 업로드 설정 (Multer)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// 1. 로그인 API
app.post('/api/login', (req, res) => {
    const { username } = req.body;
    if (!username || !username.trim()) {
        return res.status(400).json({ success: false, message: '이름을 입력하세요.' });
    }
    const trimmedName = username.trim();
    if (!users.includes(trimmedName)) {
        users.push(trimmedName);
    }
    res.json({ success: true, username: trimmedName });
});

// 2. 게시글 목록 조회 API
app.get('/api/posts', (req, res) => {
    res.json(posts);
});

// 3. 게시글 작성 (이미지 업로드 포함) API
app.post('/api/posts', upload.single('image'), (req, res) => {
    const { author, title, desc } = req.body;
    
    if (!author || !title) {
        return res.status(400).json({ success: false, message: '작성자와 제목은 필수입니다.' });
    }

    const newPost = {
        id: Date.now(),
        author,
        title,
        desc: desc || '',
        image: req.file ? `/uploads/${req.file.filename}` : null,
        date: new Date().toLocaleDateString()
    };

    posts.unshift(newPost);
    res.json({ success: true, post: newPost });
});

// 서버 실행
app.listen(PORT, () => {
    console.log(`서버가 실행 중입니다: http://localhost:${PORT}`);
});