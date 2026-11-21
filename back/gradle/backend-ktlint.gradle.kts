import org.gradle.api.Action
import org.gradle.api.provider.Property
import org.gradle.api.tasks.util.PatternFilterable

val ktlintExtension = extensions.getByName("ktlint")

@Suppress("UNCHECKED_CAST")
fun <T : Any> ktlintProperty(getterName: String): Property<T> =
    ktlintExtension.javaClass.getMethod(getterName).invoke(ktlintExtension) as Property<T>

ktlintProperty<String>("getVersion").set("1.5.0")
ktlintProperty<Boolean>("getOutputToConsole").set(true)
ktlintProperty<Boolean>("getIgnoreFailures").set(false)

ktlintExtension.javaClass
    .getMethod("filter", Action::class.java)
    .invoke(
        ktlintExtension,
        Action<PatternFilterable> {
            exclude("**/build/**")
            exclude("**/generated/**")
        },
    )
