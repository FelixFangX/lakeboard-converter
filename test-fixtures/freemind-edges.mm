<map version="1.0.1">
  <node TEXT="Edges">
    <node TEXT="Alpha" ID="rich">
      <richcontent TYPE="NOTE"><html><body><p>Line one<br/>Line two</p></body></html></richcontent>
      <icon BUILTIN="button_ok"/>
    </node>
    <node LOCALIZED_TEXT="new_child" POSITION="left">
      <arrowlink DESTINATION="rich"/>
      <node TEXT="Kept"/>
    </node>
    <node TEXT="Secret" ENCRYPTED="true"/>
  </node>
</map>
