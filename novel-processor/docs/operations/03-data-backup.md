# 数据、备份与恢复

## 数据布局

```text
data/
├── library.db             # SQLite：用户、索引、模型、翻译、阅读和回收站
├── library.db-wal         # SQLite WAL，运行时可能存在
├── library.db-shm         # SQLite 共享内存文件，运行时可能存在
├── audit.log              # 管理操作审计日志
├── novels/<site>/<id>.json
└── episodes/<site>/<id>/
    ├── _manifest.json
    └── <episode>.json
```

目录和正文 JSON 是内容真源；SQLite 是索引和用户状态存储。阅读记录、模型 API Key、翻译材料、翻译历史、登录用户及回收站状态不能仅由 JSON 恢复。

## 备份

等待在途任务结束后停止 API，再从仓库根目录执行：

```sh
set -eu
umask 077
BACKUP_DIR="$HOME/novel-processor-backups"
ARCHIVE="$BACKUP_DIR/data-$(date +%Y%m%d-%H%M%S).tar.gz"
mkdir -p "$BACKUP_DIR"
(cd novel-processor/backend && docker compose stop api)
tar -czf "$ARCHIVE" -C novel-processor data
tar -tzf "$ARCHIVE" > /dev/null
(cd novel-processor/backend && docker compose start api)
printf 'Backup: %s\n' "$ARCHIVE"
```

归档失败时脚本会停止，服务可能仍处于停止状态；确认归档可读后再手动启动。模型 API Key 以明文存在数据库，备份文件必须按敏感文件保护。

同时备份后端 `.env`，但不要将它放入公开归档。阅读器偏好保存在浏览器 localStorage，不在服务端备份中。

## 恢复

1. 停止后端；
2. 将当前 `data/` 和 `.env` 备份到仓库外；
3. 清空或移走目标 `data/`；
4. 解压完整归档，包含 SQLite 主文件、WAL/SHM（如果归档时存在）、JSON 和日志；
5. 检查目录权限；
6. 启动后端并访问 `/healthz`；
7. 登录并检查书架、模型、翻译材料和阅读记录。

不要把两套数据直接合并，也不要让两个后端实例同时访问同一份 SQLite。

## 重建索引的边界

首页“重建索引”只根据目录和正文文件更新作品索引与下载标记，不能代替备份恢复，也不会恢复 SQLite 中的用户、模型、翻译、阅读和回收站数据。不要删除 `library.db` 来解决普通索引问题。
