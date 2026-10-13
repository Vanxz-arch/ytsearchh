# YouTube Channel Search

Cari video dalam channel YouTube berdasarkan keyword — judul, deskripsi, dan transkrip.

## Deploy ke Vercel (5 menit)

### 1. Upload ke GitHub
```
Buat repo baru di github.com → upload semua file ini
```

### 2. Deploy ke Vercel
1. Buka [vercel.com](https://vercel.com) → New Project
2. Import repo GitHub yang tadi dibuat
3. Klik **Deploy** — selesai

### 3. (Opsional) Set API Key di server
Di Vercel dashboard → Settings → Environment Variables:
```
YOUTUBE_API_KEY = AIzaSy...
```
Kalau tidak di-set, user input API key sendiri lewat UI.

---

## Dev lokal
```bash
npm install
npm run dev
# Buka http://localhost:3000
```

---

## Cara dapat API Key gratis
1. Buka [Google Cloud Console](https://console.cloud.google.com)
2. Buat project → APIs & Services → Library
3. Cari **YouTube Data API v3** → Enable
4. Credentials → Create Credentials → API Key
5. Kuota gratis: ~100 pencarian/hari

---

## Fitur
- ✅ Cari video by judul
- ✅ Cari video by deskripsi  
- ⚡ Cari dalam transkrip (perlu CC tersedia)
- ✅ Filter tanggal, urutkan
- ✅ Thumbnail, durasi, views
- ✅ Highlight keyword di hasil
- ✅ Riwayat pencarian
- ✅ Load more (pagination)
- ✅ Grid / List view
- ✅ Dark mode
- ✅ Responsif mobile
