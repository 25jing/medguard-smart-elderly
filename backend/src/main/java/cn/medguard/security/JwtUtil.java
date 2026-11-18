package cn.medguard.security;

import cn.medguard.config.AppProps;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

/** JWT 工具（jjwt 0.12 API）：无状态鉴权，token 携带 uid/role/name/phone */
@Component
@RequiredArgsConstructor
public class JwtUtil {

    private final AppProps props;

    private SecretKey key() {
        return Keys.hmacShaKeyFor(props.getJwt().getSecret().getBytes(StandardCharsets.UTF_8));
    }

    public String generate(Long uid, String phone, String name, String role) {
        long expireMs = props.getJwt().getExpireHours() * 3600_000L;
        return Jwts.builder()
                .subject(String.valueOf(uid))
                .claim("phone", phone)
                .claim("name", name)
                .claim("role", role)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + expireMs))
                .signWith(key())
                .compact();
    }

    public UserContext.CurrentUser parse(String token) {
        Claims c = Jwts.parser().verifyWith(key()).build()
                .parseSignedClaims(token).getPayload();
        return new UserContext.CurrentUser(
                Long.valueOf(c.getSubject()),
                c.get("phone", String.class),
                c.get("name", String.class),
                c.get("role", String.class));
    }
}
