package cn.medguard.common;

/** 业务异常：抛出后由 GlobalExceptionHandler 统一转成 ApiResult。 */
public class BizException extends RuntimeException {
    private final int code;

    public BizException(String msg) { this(400, msg); }
    public BizException(int code, String msg) {
        super(msg);
        this.code = code;
    }
    public int getCode() { return code; }

    public static BizException unauthorized(String msg) { return new BizException(401, msg); }
    public static BizException forbidden(String msg) { return new BizException(403, msg); }
    public static BizException notFound(String msg) { return new BizException(404, msg); }
}
