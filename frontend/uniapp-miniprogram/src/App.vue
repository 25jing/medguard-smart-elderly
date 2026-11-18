<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'
import { useUser } from './store/user'

onLaunch(() => {
  // 启动时恢复登录态；未登录跳转登录页
  const user = useUser()
  user.restore()
  if (!user.token) {
    uni.reLaunch({ url: '/pages/login/login' })
  }
})
</script>

<style>
/* 全局设计系统 v2（对齐 H5 app.css v2）：弥散浅底 / 玻璃卡片 / 渐变品牌按钮 */
page {
  background-color: #f4f7f8;
  color: #0f172a;
  font-size: 34rpx;
  font-family: "PingFang SC", "Microsoft YaHei", sans-serif;
  line-height: 1.6;
}
.btn-primary {
  background: linear-gradient(135deg, #0f766e, #14b8a6);
  color: #fff;
  border: none;
  border-radius: 32rpx;
  font-size: 38rpx;
  font-weight: 800;
  letter-spacing: 2rpx;
  min-height: 104rpx;
  line-height: 104rpx;
  box-shadow: 0 12rpx 34rpx rgba(13, 148, 136, 0.32), inset 0 2rpx 0 rgba(255, 255, 255, 0.3);
}
.btn-primary::after { border: none; }
.card {
  background: rgba(255, 255, 255, 0.95);
  border: 1rpx solid rgba(255, 255, 255, 0.8);
  border-radius: 40rpx;
  padding: 32rpx;
  margin: 20rpx 24rpx;
  box-shadow: 0 2rpx 8rpx rgba(15, 23, 42, 0.04), 0 8rpx 32rpx rgba(15, 23, 42, 0.08);
  animation: mgRise 0.4s ease-out backwards;
}
@keyframes mgRise {
  from { opacity: 0; transform: translateY(24rpx); }
  to { opacity: 1; transform: none; }
}
</style>
