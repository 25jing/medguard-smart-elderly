package cn.medguard.config;

import cn.medguard.security.AuthInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Web 配置：CORS、鉴权拦截器、前端静态资源映射。
 * /h5/**  → frontend/h5-app   （老人端 App·H5/PWA）
 * /admin/** → frontend/admin-web （管理端 Vue3+Element Plus）
 */
@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {

    private final AuthInterceptor authInterceptor;
    private final AppProps props;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(authInterceptor)
                .addPathPatterns("/api/**")
                .excludePathPatterns(
                        "/api/auth/login",
                        "/api/auth/register",
                        "/api/health",
                        "/api/internal/**"
                );
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOriginPatterns("*")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .maxAge(3600);
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        Path front = Paths.get(props.getFrontend().getDir()).toAbsolutePath().normalize();
        // cachePeriod(0)：强制浏览器每次回源校验（304 很快），改前端立刻全员可见，不再被缓存坑
        registry.addResourceHandler("/h5/**")
                .addResourceLocations(front.resolve("h5-app").toUri().toString())
                .setCachePeriod(0);
        registry.addResourceHandler("/admin/**")
                .addResourceLocations(front.resolve("admin-web").toUri().toString())
                .setCachePeriod(0);
        // 根路径 = 统一入口门户（三端大门卡 + 演示账号 + 服务状态灯）
        registry.addResourceHandler("/portal/**")
                .addResourceLocations(front.resolve("portal").toUri().toString())
                .setCachePeriod(0);
        registry.addResourceHandler("/", "/index.html")
                .addResourceLocations(front.resolve("portal").toUri().toString())
                .setCachePeriod(0);
    }

    /** SpringBoot 3.2 资源处理器不自动欢迎 index.html：目录访问需显式 forward，否则 /h5/ 报 NoResourceFound */
    @Override
    public void addViewControllers(org.springframework.web.servlet.config.annotation.ViewControllerRegistry registry) {
        registry.addViewController("/").setViewName("forward:/index.html");
        registry.addViewController("/h5/").setViewName("forward:/h5/index.html");
        registry.addViewController("/h5").setViewName("redirect:/h5/");
        registry.addViewController("/admin/").setViewName("forward:/admin/index.html");
        registry.addViewController("/admin").setViewName("redirect:/admin/");
    }
}
