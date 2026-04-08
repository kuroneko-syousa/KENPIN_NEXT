# Authentication

## Method

Credentials Authentication (Email / Password)

## Library

NextAuth.js

## Session

* JWTベース
* httpOnly Cookie

## Roles

* admin
* user

## Access Control

* 未ログイン → / にリダイレクト
* admin → 全機能
* user → 制限付き

## TODO

* OAuth対応（Googleなど）
* DB連携
