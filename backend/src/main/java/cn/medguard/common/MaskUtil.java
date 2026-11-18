package cn.medguard.common;

/**
 * 敏感字段分级脱敏（申报书承诺：敏感字段脱敏覆盖率100%，家属端只见汇总不见明细）。
 */
public final class MaskUtil {
    private MaskUtil() {}

    /** 姓名脱敏：张三→张*，欧阳娜娜→欧**娜 */
    public static String name(String name) {
        if (name == null || name.isEmpty()) return name;
        if (name.length() == 1) return name;
        if (name.length() == 2) return name.charAt(0) + "*";
        return name.charAt(0) + "*".repeat(name.length() - 2) + name.charAt(name.length() - 1);
    }

    /** 手机号脱敏：13812345678→138****5678 */
    public static String phone(String phone) {
        if (phone == null || phone.length() < 7) return phone;
        return phone.substring(0, 3) + "****" + phone.substring(phone.length() - 4);
    }

    /** 药品明细模糊化：家属汇总视图只显示类别与数量，不显示原始明细 */
    public static String medBrief(String medName) {
        if (medName == null || medName.length() <= 2) return medName;
        return medName.substring(0, 2) + "**";
    }
}
