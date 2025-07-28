const express = require('express');
const multer = require('multer');
const { ensureAuth } = require('../middleware/auth');
const Post = require('../models/Post');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const uploadPath = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

router.post('/', ensureAuth, upload.single('image'), async (req, res) => {
  try {
    const newPost = await Post.create({
      imageUrl: `/uploads/${req.file.filename}`,
      userId: req.user.id,
      user_name: req.user.displayName
    });
    res.status(200).json(newPost);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save post' });
  }
});

router.post('/:id/like', ensureAuth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).send();

    const userId = req.user.id;
    if (post.likedBy.includes(userId)) {
      post.likes--;
      post.likedBy.pull(userId);
    } else {
      post.likes++;
      post.likedBy.push(userId);
    }

    await post.save();
    res.json({ likes: post.likes });
  } catch (err) {
    res.status(500).send();
  }
});

module.exports = router;
