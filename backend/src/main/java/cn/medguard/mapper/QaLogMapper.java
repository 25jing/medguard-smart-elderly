package cn.medguard.mapper;

import cn.medguard.entity.QaLog;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

@Mapper
public interface QaLogMapper extends BaseMapper<QaLog> {

    @Select("SELECT DATE(created_at) AS d, COUNT(*) AS cnt, " +
            "SUM(refused) AS refused_cnt, AVG(latency_ms) AS avg_ms " +
            "FROM mg_qa_log WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) " +
            "GROUP BY DATE(created_at) ORDER BY d")
    List<Map<String, Object>> weekTrend();
}
