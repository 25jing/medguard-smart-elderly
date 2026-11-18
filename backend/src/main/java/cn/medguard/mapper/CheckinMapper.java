package cn.medguard.mapper;

import cn.medguard.entity.Checkin;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

@Mapper
public interface CheckinMapper extends BaseMapper<Checkin> {

    /** 依从率统计：某老人最近 N 天各状态计数 */
    @Select("SELECT status, COUNT(*) AS cnt FROM mg_checkin WHERE elder_id=#{elderId} " +
            "AND scheduled_at >= DATE_SUB(NOW(), INTERVAL #{days} DAY) GROUP BY status")
    List<Map<String, Object>> countByStatus(@Param("elderId") Long elderId, @Param("days") int days);

    /** 按天分组的打卡趋势（管理端/家属端图表） */
    @Select("SELECT DATE(scheduled_at) AS d, status, COUNT(*) AS cnt FROM mg_checkin " +
            "WHERE elder_id=#{elderId} AND scheduled_at >= DATE_SUB(NOW(), INTERVAL #{days} DAY) " +
            "GROUP BY DATE(scheduled_at), status ORDER BY d")
    List<Map<String, Object>> dailyTrend(@Param("elderId") Long elderId, @Param("days") int days);
}
