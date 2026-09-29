const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// 업로드된 파일이 저장될 폴더 생성
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// 데이터가 영구 저장될 JSON 파일 경로
const dataFile = path.join(__dirname, 'posts.json');

// 게시글 데이터 불러오기 함수
function loadPosts() {
    if (fs.existsSync(dataFile)) {
        try {
            const data = fs.readFileSync(dataFile, 'utf8');
            return JSON.parse(data);
        } catch (e) {
            return [];
        }
    }
    return [];
}

// 게시글 데이터 저장하기 함수
function savePosts(posts) {
    fs.writeFileSync(dataFile, JSON.stringify(posts, null, 2), 'utf8');
}

// 미들웨어 설정
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

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

// 1. 게시글 목록 조회 API (파일에서 실시간 로드)
app.get('/api/posts', (req, res) => {
    const posts = loadPosts();
    res.json(posts);
});

// 2. 게시글 작성 API (파일에 즉시 저장)
app.post('/api/posts', upload.single('image'), (req, res) => {
    const { author, title, desc } = req.body;
    
    if (!author || !title) {
        return res.status(400).json({ success: false, message: '작성자와 제목은 필수입니다.' });
    }

    const posts = loadPosts();

    const newPost = {
        id: Date.now(),
        author,
        title,
        desc: desc || '',
        image: req.file ? `/uploads/${req.file.filename}` : null,
        date: new Date().toLocaleDateString()
    };

    posts.unshift(newPost);
    savePosts(posts); // 파일에 저장

    res.json({ success: true, post: newPost });
});

// 서버 실행
app.listen(PORT, () => {
    console.log(`서버가 실행 중입니다: http://localhost:${PORT}`);
});
