package cn.medguard.security;

/** 当前请求的登录用户（ThreadLocal，由 AuthInterceptor 写入/清理） */
public class UserContext {
    public record CurrentUser(Long id, String phone, String name, String role) {
        public boolean isAdmin() { return "ADMIN".equals(role); }
        public boolean isElder() { return "ELDER".equals(role); }
        public boolean isFamily() { return "FAMILY".equals(role); }
    }

    private static final ThreadLocal<CurrentUser> HOLDER = new ThreadLocal<>();

    public static void set(CurrentUser u) { HOLDER.set(u); }
    public static CurrentUser get() { return HOLDER.get(); }
    public static void clear() { HOLDER.remove(); }

    public static CurrentUser require() {
        CurrentUser u = HOLDER.get();
        if (u == null) throw cn.medguard.common.BizException.unauthorized("请先登录");
        return u;
    }
}
