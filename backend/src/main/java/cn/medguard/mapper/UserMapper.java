package cn.medguard.mapper;

import cn.medguard.entity.User;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface UserMapper extends BaseMapper<User> {

    /** 账号注销满30天后的级联物理清除（隐私承诺：用药记录保存至注销后30天） */
    @Delete("DELETE FROM mg_checkin WHERE elder_id=#{id}; " +
            "DELETE FROM mg_reminder WHERE elder_id=#{id}; " +
            "DELETE FROM mg_med_plan WHERE elder_id=#{id}; " +
            "DELETE FROM mg_family_bind WHERE elder_id=#{id} OR family_id=#{id}; " +
            "DELETE FROM mg_recognize_log WHERE user_id=#{id}; " +
            "DELETE FROM mg_qa_log WHERE user_id=#{id}; " +
            "DELETE FROM mg_user WHERE id=#{id}")
    int physicalDeleteCascade(Long id);
}
