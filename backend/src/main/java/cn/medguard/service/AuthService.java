package cn.medguard.service;

import cn.medguard.common.BizException;
import cn.medguard.config.AppProps;
import cn.medguard.entity.User;
import cn.medguard.mapper.UserMapper;
import cn.medguard.security.JwtUtil;
import cn.medguard.security.UserContext;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

/** 账号：注册/登录/JWT签发/知情同意/注销与30天级联清除 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserMapper userMapper;
    private final JwtUtil jwtUtil;
    private final AuditService audit;
    private final AppProps props;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    public Map<String, Object> register(String phone, String password, String name, String role, Integer birthYear) {
        if (phone == null || !phone.matches("^1\\d{10}$|^admin$")) throw new BizException("手机号格式不正确");
        if (password == null || password.length() < 6) throw new BizException("密码至少6位");
        if (name == null || name.isBlank()) throw new BizException("请填写姓名");
        if (!Map.of("ELDER", 1, "FAMILY", 1).containsKey(role == null ? "" : role))
            throw new BizException("角色只能是 ELDER(老人) 或 FAMILY(家属)，管理员由系统初始化");
        Long exists = userMapper.selectCount(new QueryWrapper<User>().eq("phone", phone));
        if (exists != null && exists > 0) throw new BizException("该手机号已注册，请直接登录");

        User u = new User();
        u.setPhone(phone);
        u.setPassword(encoder.encode(password));
        u.setName(name.trim());
        u.setRole(role);
        u.setBirthYear(birthYear);
        u.setConsentAt(LocalDateTime.now()); // 注册页内置大字版知情同意书，勾选即记录时间
        userMapper.insert(u);
        audit.log(u.getId(), u.getName(), "REGISTER", "user", u.getId(),
                role + " 注册: " + cn.medguard.common.MaskUtil.phone(phone));
        return tokenPayload(u);
    }

    public Map<String, Object> login(String phone, String password) {
        User u = userMapper.selectOne(new QueryWrapper<User>().eq("phone", phone));
        if (u == null || !encoder.matches(password, u.getPassword()))
            throw new BizException("手机号或密码错误");
        if (u.getDeleted() != null && u.getDeleted() == 1)
            throw new BizException("该账号已注销，如需恢复请联系管理员");
        audit.log(u.getId(), u.getName(), "LOGIN", "user", u.getId(), "登录成功");
        return tokenPayload(u);
    }

    private Map<String, Object> tokenPayload(User u) {
        String token = jwtUtil.generate(u.getId(), u.getPhone(), u.getName(), u.getRole());
        Map<String, Object> user = new HashMap<>();
        user.put("id", u.getId());
        user.put("phone", u.getPhone());
        user.put("name", u.getName());
        user.put("role", u.getRole());
        user.put("birthYear", u.getBirthYear());
        user.put("consentAt", u.getConsentAt());
        user.put("healthConsentAt", u.getHealthConsentAt());
        Map<String, Object> r = new HashMap<>();
        r.put("token", token);
        r.put("user", user);
        return r;
    }

    public User requireUser(Long id) {
        User u = userMapper.selectById(id);
        if (u == null) throw BizException.notFound("用户不存在");
        return u;
    }

    /** 健康信息单独同意（可查看/撤回） */
    public void healthConsent(boolean agree) {
        UserContext.CurrentUser cur = UserContext.require();
        User u = requireUser(cur.id());
        u.setHealthConsentAt(agree ? LocalDateTime.now() : null);
        userMapper.updateById(u);
        audit.log(agree ? "HEALTH_CONSENT_GRANT" : "HEALTH_CONSENT_WITHDRAW", "user", u.getId(), null);
    }

    /** 注销账号：软删除+级联标记，30天后由定时任务物理清除（申报书隐私承诺） */
    public void deleteAccount() {
        UserContext.CurrentUser cur = UserContext.require();
        User u = requireUser(cur.id());
        u.setDeleted(1);
        u.setDeletedAt(LocalDateTime.now());
        userMapper.updateById(u);
        audit.log("ACCOUNT_DELETE", "user", u.getId(),
                "账号注销，数据将于 " + props.getPrivacy().getAccountPurgeDays() + " 天后级联清除");
    }

    /** 每天凌晨3点：物理清除注销超过30天的账号数据（级联）；申报书隐私承诺落地 */
    @Scheduled(cron = "0 0 3 * * *")
    public void purgeJob() {
        LocalDateTime deadline = LocalDateTime.now().minusDays(props.getPrivacy().getAccountPurgeDays());
        var doomed = userMapper.selectList(new QueryWrapper<User>()
                .eq("deleted", 1).lt("deleted_at", deadline));
        for (User u : doomed) {
            userMapper.physicalDeleteCascade(u.getId());
            log.info("级联清除已注销账号数据: uid={}", u.getId());
            audit.log("PURGE", "user", u.getId(), "注销满30天，用药记录等数据已级联清除");
        }
    }
}
