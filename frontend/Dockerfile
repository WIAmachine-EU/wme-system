# 1단계: Node.js 환경에서 빌드
FROM node:20-slim AS build
WORKDIR /app



# 👇 새로 추가할 부분: Render에서 넘겨주는 환경 변수들을 받아옵니다.
ARG VITE_API_BASE_URL
ARG VITE_R2_CUSTOM_DOMAIN
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_R2_CUSTOM_DOMAIN=$VITE_R2_CUSTOM_DOMAIN
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
# 👆 여기까지 새로 추가

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# 2단계: Nginx를 통해 정적 파일 서빙 및 리버스 프록시
FROM nginx:alpine
# 커스텀 Nginx 설정 복사
COPY nginx.conf /etc/nginx/conf.d/default.conf
# 빌드된 정적 파일 복사
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
