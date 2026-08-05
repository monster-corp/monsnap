-- 기존 길이 CHECK(users_nickname_check)는 그대로 유지
-- 문자 종류(한글/영문/숫자만 허용) CHECK를 추가로 얹음
ALTER TABLE "users" ADD CONSTRAINT "users_nickname_format_check"
    CHECK (nickname ~ '^[가-힣a-zA-Z0-9]+$');