# CareerPath AI — frontend (React + Vite → ไฟล์ static เสิร์ฟด้วย nginx)
# build:  docker compose build frontend
# nginx ส่ง /api ต่อให้ backend ใน docker network → เว็บกับ API อยู่โดเมนเดียวกัน ไม่ต้องตั้ง CORS

# ---------- 1) build ----------
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# เรียก API จริง (ไม่ใช่โหมดตัวอย่าง) — path เดียวกับ dev
ENV VITE_API_URL=/api
RUN npm run build

# ---------- 2) serve ----------
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
