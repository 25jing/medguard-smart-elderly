package cn.medguard.common;

import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BizException.class)
    public ApiResult<Void> biz(BizException e) {
        return ApiResult.fail(e.getCode(), e.getMessage());
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ApiResult<Void> uploadTooBig(MaxUploadSizeExceededException e) {
        return ApiResult.fail(413, "图片太大了，请重新拍摄或选择更小的照片");
    }

    @ExceptionHandler(Exception.class)
    public ApiResult<Void> other(Exception e) {
        log.error("未处理异常", e);
        return ApiResult.fail(500, "服务器开小差了：" + e.getClass().getSimpleName());
    }
}
