package cn.medguard.common;

/**
 * 统一响应包装。code=0 成功；非 0 为业务/系统错误码。
 */
public class ApiResult<T> {
    private int code;
    private String msg;
    private T data;

    public static <T> ApiResult<T> ok(T data) {
        ApiResult<T> r = new ApiResult<>();
        r.code = 0; r.msg = "ok"; r.data = data;
        return r;
    }
    public static <T> ApiResult<T> ok() { return ok(null); }
    public static <T> ApiResult<T> fail(int code, String msg) {
        ApiResult<T> r = new ApiResult<>();
        r.code = code; r.msg = msg;
        return r;
    }
    public int getCode() { return code; }
    public String getMsg() { return msg; }
    public T getData() { return data; }
}
